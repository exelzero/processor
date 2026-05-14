from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment

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
    return d


@router.get("/")
def list_appointments(db: Session = Depends(get_db), _=Depends(verify_token)):
    appts = db.query(Appointment).order_by(Appointment.scheduled_at).all()
    return [_enrich(a) for a in appts]


@router.post("/", status_code=201)
def create_appointment(data: AppointmentIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = Appointment(**data.model_dump())
    db.add(appt)
    db.commit()
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
    for field, value in data.model_dump().items():
        setattr(appt, field, value)
    db.commit()
    db.refresh(appt)
    return _enrich(appt)


@router.patch("/{appt_id}/status")
def update_status(appt_id: int, status: str, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    appt.status = status
    db.commit()
    return {"id": appt_id, "status": status}


@router.delete("/{appt_id}", status_code=204)
def delete_appointment(appt_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    appt = db.get(Appointment, appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    db.delete(appt)
    db.commit()
