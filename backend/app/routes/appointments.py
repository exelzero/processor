from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.utils.intervals_cache import intervals_cache as _intervals_cache

router = APIRouter()


class AppointmentIn(BaseModel):
    patient_id: int
    service_id: int
    scheduled_at: datetime
    status: str = "scheduled"
    notes: Optional[str] = None


def _enrich(appt: Appointment) -> dict:
    d = {c.name: getattr(appt, c.name) for c in appt.__table__.columns}
    d["patient_name"] = f"{appt.patient.first_name} {appt.patient.last_name}" if appt.patient else None
    d["service_name"] = appt.service.name if appt.service else None
    d["service_price"] = appt.service.price if appt.service else None
    d["service_duration_minutes"] = appt.service.duration_minutes if appt.service else 60
    d["service_category"] = appt.service.category if appt.service else None
    return d


@router.get("/")
def list_appointments(db: Session = Depends(get_db), _=Depends(verify_token)):
    # Without joinedload, SQLAlchemy lazy-loads each relationship on first access.
    # _enrich() touches appt.patient and appt.service for every row, so n
    # appointments → 2n extra SELECT statements (N+1 problem).
    #
    # joinedload rewrites the query to a single LEFT OUTER JOIN per relationship:
    #
    #   SELECT appointments.*, patients.*, services.*
    #   FROM appointments
    #   LEFT OUTER JOIN patients ON patients.id = appointments.patient_id
    #   LEFT OUTER JOIN services ON services.id = appointments.service_id
    #
    # One round-trip regardless of n.  SQLAlchemy populates the .patient and
    # .service attributes from the joined columns, so _enrich() finds them
    # already loaded and issues no further queries.
    #
    # LEFT OUTER JOIN (not INNER) is intentional: an appointment whose FK points
    # to a deleted patient or service still appears in the list with a None
    # relationship — _enrich() guards against that with `if appt.patient`.
    appts = (
        db.query(Appointment)
        .options(
            joinedload(Appointment.patient),
            joinedload(Appointment.service),
        )
        .order_by(Appointment.scheduled_at)
        .all()
    )
    return [_enrich(a) for a in appts]


@router.post("/", status_code=201)
def create_appointment(data: AppointmentIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = Appointment(**data.model_dump())
    db.add(appt)
    db.commit()
    _intervals_cache.invalidate(data.scheduled_at.date().isoformat())
    db.refresh(appt)
    return _enrich(appt)


@router.get("/{appt_id}")
def get_appointment(appt_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _enrich(appt)


@router.put("/{appt_id}")
def update_appointment(appt_id: int, data: AppointmentIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    old_date = appt.scheduled_at.date().isoformat()
    for field, value in data.model_dump().items():
        setattr(appt, field, value)
    db.commit()
    # Invalidate both the old and new date in case the appointment was rescheduled.
    _intervals_cache.invalidate(old_date)
    _intervals_cache.invalidate(data.scheduled_at.date().isoformat())
    db.refresh(appt)
    return _enrich(appt)


@router.patch("/{appt_id}/status")
def update_status(appt_id: int, status: str, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    appt.status = status
    db.commit()
    _intervals_cache.invalidate(appt.scheduled_at.date().isoformat())
    return {"id": appt_id, "status": status}


@router.delete("/{appt_id}", status_code=204)
def delete_appointment(appt_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    date_key = appt.scheduled_at.date().isoformat()
    db.delete(appt)
    db.commit()
    _intervals_cache.invalidate(date_key)
