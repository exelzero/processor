import re
from decimal import Decimal
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, extract, String
from pydantic import BaseModel, field_validator
from datetime import date

from app.database import get_db
from app.auth import verify_token
from app.models.expense import Expense, EXPENSE_CATEGORIES

router = APIRouter()

_MONTH_RE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


class ExpenseIn(BaseModel):
    category: Literal[tuple(EXPENSE_CATEGORIES)]
    description: str
    amount: Decimal
    expense_date: date
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be greater than zero")
        return v


class ExpenseOut(ExpenseIn):
    id: int
    created_at: str

    model_config = {"from_attributes": True}


@router.get("/categories")
def list_categories(_=Depends(verify_token)):
    return EXPENSE_CATEGORIES


@router.get("/summary")
def expense_summary(db: Session = Depends(get_db), _=Depends(verify_token)):
    # Use portable ANSI SQL: cast date to text and slice YYYY-MM
    month_expr = func.substr(cast(Expense.expense_date, String), 1, 7)
    rows = (
        db.query(
            month_expr.label("month"),
            Expense.category,
            func.sum(Expense.amount).label("total"),
        )
        .group_by(month_expr, Expense.category)
        .order_by(month_expr)
        .all()
    )
    pivot: dict = {}
    for r in rows:
        if r.month not in pivot:
            pivot[r.month] = {"month": r.month}
        pivot[r.month][r.category] = round(float(r.total), 2)
    return list(pivot.values())


@router.get("/", response_model=List[ExpenseOut])
def list_expenses(
    category: Optional[str] = None,
    month: Optional[str] = None,   # YYYY-MM
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    if category and category not in EXPENSE_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Unknown category: {category}")
    if month and not _MONTH_RE.match(month):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM (e.g. 2025-09)")

    q = db.query(Expense)
    if category:
        q = q.filter(Expense.category == category)
    if month:
        year, mon = month.split("-")
        q = q.filter(
            extract("year",  Expense.expense_date) == int(year),
            extract("month", Expense.expense_date) == int(mon),
        )
    return q.order_by(Expense.expense_date.desc()).all()


@router.post("/", response_model=ExpenseOut, status_code=201)
def create_expense(data: ExpenseIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    expense = Expense(**data.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: int, data: ExpenseIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    for field, value in data.model_dump().items():
        setattr(expense, field, value)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()
