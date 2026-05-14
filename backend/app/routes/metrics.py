from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service

router = APIRouter()


@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Depends(verify_token)):
    total_patients = db.query(func.count(Patient.id)).scalar()
    total_appointments = db.query(func.count(Appointment.id)).scalar()
    completed = db.query(func.count(Appointment.id)).filter(Appointment.status == "completed").scalar()
    total_revenue = (
        db.query(func.sum(Service.price))
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == "completed")
        .scalar() or 0.0
    )

    return {
        "total_patients": total_patients,
        "total_appointments": total_appointments,
        "completed_appointments": completed,
        "total_revenue": round(total_revenue, 2),
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
