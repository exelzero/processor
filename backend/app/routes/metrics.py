from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import cast, func, String

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service
from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.models.expense import Expense

router = APIRouter()


@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Depends(verify_token)):
    total_patients = db.query(func.count(Patient.id)).scalar()
    total_appointments = db.query(func.count(Appointment.id)).scalar()
    completed = db.query(func.count(Appointment.id)).filter(Appointment.status == "completed").scalar()
    service_revenue = float(
        db.query(func.sum(Service.price))
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == "completed")
        .scalar() or 0.0
    )
    product_revenue = float(
        db.query(func.sum(Sale.total))
        .filter(Sale.status.in_(['completed', 'partially_refunded']))
        .scalar() or 0.0
    )

    total_expenses = float(
        db.query(func.sum(Expense.amount)).scalar() or 0.0
    )

    return {
        "total_patients": total_patients,
        "total_appointments": total_appointments,
        "completed_appointments": completed,
        "total_revenue": round(service_revenue + product_revenue, 2),
        "total_expenses": round(total_expenses, 2),
    }


@router.get("/revenue-by-service")
def revenue_by_service(db: Session = Depends(get_db), _=Depends(verify_token)):
    rows = (
        db.query(Service.name, func.count(Appointment.id).label("count"), func.sum(Service.price).label("revenue"))
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == "completed")
        .group_by(Service.id)
        .order_by(func.sum(Service.price).desc())
        .all()
    )
    return [{"service": r.name, "count": r.count, "revenue": round(r.revenue, 2)} for r in rows]


@router.get("/revenue-by-month")
def revenue_by_month(db: Session = Depends(get_db), _=Depends(verify_token)):
    from datetime import date
    current_year = str(date.today().year)

    appt_rows = (
        db.query(
            func.substr(cast(Appointment.scheduled_at, String), 1, 7).label('month'),
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Service, Appointment.service_id == Service.id)
        .filter(
            Appointment.status == 'completed',
            func.substr(cast(Appointment.scheduled_at, String), 1, 4) == current_year,
        )
        .group_by(func.substr(cast(Appointment.scheduled_at, String), 1, 7))
        .all()
    )
    sale_rows = (
        db.query(
            func.substr(cast(Sale.sale_date, String), 1, 7).label('month'),
            func.sum(Sale.total).label('revenue'),
        )
        .filter(
            Sale.status.in_(['completed', 'partially_refunded']),
            func.substr(cast(Sale.sale_date, String), 1, 4) == current_year,
        )
        .group_by(func.substr(cast(Sale.sale_date, String), 1, 7))
        .all()
    )
    expense_rows = (
        db.query(
            func.substr(cast(Expense.expense_date, String), 1, 7).label('month'),
            func.sum(Expense.amount).label('expenses'),
        )
        .filter(func.substr(cast(Expense.expense_date, String), 1, 4) == current_year)
        .group_by(func.substr(cast(Expense.expense_date, String), 1, 7))
        .all()
    )

    by_month = defaultdict(lambda: {'revenue': 0.0, 'expenses': 0.0, 'count': 0})
    for r in appt_rows:
        by_month[r.month]['revenue'] += float(r.revenue)
        by_month[r.month]['count'] += r.count
    for r in sale_rows:
        by_month[r.month]['revenue'] += float(r.revenue)
    for r in expense_rows:
        by_month[r.month]['expenses'] += float(r.expenses)

    return [
        {'month': m, 'revenue': round(d['revenue'], 2), 'expenses': round(d['expenses'], 2), 'count': d['count']}
        for m, d in sorted(by_month.items())
    ]


@router.get("/upcoming")
def upcoming(db: Session = Depends(get_db), _=Depends(verify_token)):
    from datetime import datetime
    appts = (
        db.query(Appointment)
        .filter(Appointment.scheduled_at >= datetime.utcnow(), Appointment.status == "scheduled")
        .order_by(Appointment.scheduled_at)
        .limit(10)
        .all()
    )
    return [
        {
            "id": a.id,
            "scheduled_at": a.scheduled_at,
            "patient": f"{a.patient.first_name} {a.patient.last_name}",
            "service": a.service.name,
            "price": a.service.price,
        }
        for a in appts
    ]


@router.get("/sales-summary")
def sales_summary(db: Session = Depends(get_db), _=Depends(verify_token)):
    total_transactions = db.query(func.count(Sale.id)).scalar()
    gross_revenue = (
        db.query(func.sum(Sale.total))
        .filter(Sale.status.in_(['completed', 'partially_refunded']))
        .scalar() or 0.0
    )
    top_products = (
        db.query(
            Product.name,
            func.sum(SaleItem.quantity).label('units'),
            func.sum(SaleItem.total).label('revenue'),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.status != 'refunded')
        .group_by(Product.id, Product.name)
        .order_by(func.sum(SaleItem.total).desc())
        .limit(5)
        .all()
    )
    return {
        "total_transactions": total_transactions,
        "gross_revenue": round(float(gross_revenue), 2),
        "top_products": [
            {"name": r.name, "units": int(r.units), "revenue": round(float(r.revenue), 2)}
            for r in top_products
        ],
    }


@router.get("/inventory-summary")
def inventory_summary(db: Session = Depends(get_db), _=Depends(verify_token)):
    total_active   = db.query(func.count(Product.id)).filter(Product.active == True).scalar()
    out_of_stock   = db.query(func.count(Product.id)).filter(Product.active == True, Product.stock_qty <= 0).scalar()
    low_stock      = db.query(func.count(Product.id)).filter(Product.active == True, Product.stock_qty > 0, Product.stock_qty <= 3).scalar()
    on_order_count = db.query(func.count(Product.id)).filter(Product.active == True, Product.stock_on_order > 0).scalar()
    low_stock_items = (
        db.query(Product)
        .filter(Product.active == True, Product.stock_qty <= 3)
        .order_by(Product.stock_qty.asc())
        .limit(6)
        .all()
    )
    return {
        "total_active": total_active,
        "out_of_stock": out_of_stock,
        "low_stock": low_stock,
        "on_order_count": on_order_count,
        "low_stock_items": [
            {
                "name": p.name,
                "brand": p.brand,
                "stock_qty": p.stock_qty,
                "stock_on_order": p.stock_on_order,
            }
            for p in low_stock_items
        ],
    }
