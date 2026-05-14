from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date, datetime

from app.database import get_db
from app.auth import verify_token
from app.models.patient import Patient

router = APIRouter()


class PatientIn(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    date_of_birth: Optional[date] = None
    skin_type: Optional[str] = None
    allergies: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(PatientIn):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# Dependency Injection at the call site.
#
# Depends(get_db)      — FastAPI calls get_db(), yields a Session, passes it
#                        as `db`, and closes it after the response is sent.
# Depends(verify_token) — FastAPI resolves the full sub-graph (oauth2_scheme →
#                        verify_token) before this handler runs.  A 401 from
#                        verify_token short-circuits the request; the handler
#                        body never executes.
# _=Depends(...)       — the return value is discarded (we only care about the
#                        side-effect: raising 401 if the token is invalid).
#
# Neither `db` nor the token verification are instantiated by this function —
# it declares what it needs and FastAPI satisfies those declarations.  This is
# the inversion-of-control principle: dependencies flow in, not out.
@router.get("/", response_model=List[PatientOut])
def list_patients(db: Session = Depends(get_db), _=Depends(verify_token)):
    return db.query(Patient).order_by(Patient.last_name).all()


@router.post("/", response_model=PatientOut, status_code=201)
def create_patient(data: PatientIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    patient = Patient(**data.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: int, data: PatientIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    for field, value in data.model_dump().items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=204)
def delete_patient(patient_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
