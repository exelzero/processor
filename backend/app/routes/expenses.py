from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from pydantic import BaseModel
from datetime import date

from app.database import get_db
from app.auth import verify_token
from app.models.expense import Expense, EXPENSE_CATEGORIES

router = APIRouter()


class ExpenseIn(BaseModel):
    category: str
    description: str
    amount: float
    expense_date: date
    notes: Optional[str] = None


class ExpenseOut(ExpenseIn):
    id: int
    created_at: str

    model_config = {"from_attributes": True}


@router.get("/categories")
def list_categories(_=Depends(verify_token)):
    return EXPENSE_CATEGORIES


@router.get("/", response_model=List[ExpenseOut])
def list_expenses(
    category: Optional[str] = None,
    month: Optional[str] = None,   # YYYY-MM
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
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


@router.get("/summary")
def expense_summary(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Monthly totals by category — used for the analytics chart."""
    rows = (
        db.query(
            func.strftime("%Y-%m", Expense.expense_date).label("month"),
            Expense.category,
            func.sum(Expense.amount).label("total"),
        )
        .group_by(func.strftime("%Y-%m", Expense.expense_date), Expense.category)
        .order_by(func.strftime("%Y-%m", Expense.expense_date))
        .all()
    )
    # Pivot into { month: { category: total, ... }, ... }
    pivot: dict = {}
    for r in rows:
        if r.month not in pivot:
            pivot[r.month] = {"month": r.month}
        pivot[r.month][r.category] = round(float(r.total), 2)
    return list(pivot.values())


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
