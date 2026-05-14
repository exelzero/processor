from datetime import datetime, date, time, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.database import get_db
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service

router = APIRouter()

OPEN_HOUR       = 9   # 9 AM
CLOSE_HOUR      = 19  # 7 PM
BUFFER_MINUTES  = 10
SLOT_MINUTES    = 30  # slots offered every 30 min
MIN_NOTICE_HOURS = 1  # must book at least 1 hour ahead


# ── Public service list ───────────────────────────────────────────────────────

@router.get('/services')
def list_services(db: Session = Depends(get_db)):
    services = (
        db.query(Service)
        .filter(Service.active == True)
        .order_by(Service.category, Service.name)
        .all()
    )
    return [
        {
            'id':               s.id,
            'name':             s.name,
            'description':      s.description,
            'price':            s.price,
            'duration_minutes': s.duration_minutes,
            'category':         s.category,
        }
        for s in services
    ]


# ── Availability ──────────────────────────────────────────────────────────────

@router.get('/availability')
def get_availability(
    service_id: int,
    date:       date = Query(...),
    db:         Session = Depends(get_db),
):
    service = db.get(Service, service_id)
    if not service or not service.active:
        raise HTTPException(status_code=404, detail='Service not found')

    today = datetime.now().date()
    if date < today:
        return []

    day_start = datetime.combine(date, time.min)
    day_end   = datetime.combine(date, time.max)

    existing = (
        db.query(Appointment)
        .options(joinedload(Appointment.service))
        .filter(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at <= day_end,
            Appointment.status != 'cancelled',
        )
        .all()
    )

    busy = [
        (
            appt.scheduled_at,
            appt.scheduled_at + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES),
        )
        for appt in existing
    ]

    slot_duration = timedelta(minutes=service.duration_minutes + BUFFER_MINUTES)
    open_dt  = datetime.combine(date, time(OPEN_HOUR, 0))
    close_dt = datetime.combine(date, time(CLOSE_HOUR, 0))

    # For today, don't show slots within the minimum notice window
    if date == today:
        earliest = datetime.now() + timedelta(hours=MIN_NOTICE_HOURS)
        # Round up to the next SLOT_MINUTES boundary
        remainder = earliest.minute % SLOT_MINUTES
        if remainder:
            earliest += timedelta(minutes=SLOT_MINUTES - remainder)
        earliest = earliest.replace(second=0, microsecond=0)
        open_dt = max(open_dt, earliest)

    slots = []
    candidate = open_dt
    while candidate + slot_duration <= close_dt:
        candidate_end = candidate + slot_duration
        overlaps = any(
            candidate < b_end and candidate_end > b_start
            for b_start, b_end in busy
        )
        if not overlaps:
            slots.append(candidate.strftime('%H:%M'))
        candidate += timedelta(minutes=SLOT_MINUTES)

    return slots


# ── Book appointment ──────────────────────────────────────────────────────────

class BookIn(BaseModel):
    service_id: int
    date:       str   # YYYY-MM-DD
    time:       str   # HH:MM
    first_name: str
    last_name:  str
    phone:      str
    email:      str
    notes:      Optional[str] = None


@router.post('/book', status_code=201)
def book_appointment(data: BookIn, db: Session = Depends(get_db)):
    # Validate service
    service = db.get(Service, data.service_id)
    if not service or not service.active:
        raise HTTPException(status_code=404, detail='Service not found')

    # Parse and validate slot datetime
    try:
        scheduled_at = datetime.fromisoformat(f'{data.date}T{data.time}:00')
    except ValueError:
        raise HTTPException(status_code=400, detail='Invalid date or time format')

    if scheduled_at < datetime.now() + timedelta(hours=MIN_NOTICE_HOURS):
        raise HTTPException(status_code=400, detail='Cannot book a slot in the past or within the minimum notice window')

    # Re-validate slot is still free (race condition protection)
    slot_end  = scheduled_at + timedelta(minutes=service.duration_minutes + BUFFER_MINUTES)
    day_start = scheduled_at.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = scheduled_at.replace(hour=23, minute=59, second=59, microsecond=0)

    conflicts = (
        db.query(Appointment)
        .options(joinedload(Appointment.service))
        .filter(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at <= day_end,
            Appointment.status != 'cancelled',
        )
        .all()
    )

    for appt in conflicts:
        b_start = appt.scheduled_at
        b_end   = b_start + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES)
        if scheduled_at < b_end and slot_end > b_start:
            raise HTTPException(status_code=409, detail='This time slot is no longer available. Please choose another.')

    # Phone lookup or create patient
    phone_clean = data.phone.strip()
    patient     = db.query(Patient).filter(Patient.phone == phone_clean).first()
    is_new      = patient is None

    if is_new:
        # Check email isn't already taken by a different account
        if db.query(Patient).filter(Patient.email == data.email.strip()).first():
            raise HTTPException(
                status_code=400,
                detail='An account with this email already exists. Please use the phone number on your existing account.',
            )
        patient = Patient(
            first_name=data.first_name.strip(),
            last_name=data.last_name.strip(),
            email=data.email.strip(),
            phone=phone_clean,
        )
        db.add(patient)
        db.flush()

    appointment = Appointment(
        patient_id=patient.id,
        service_id=data.service_id,
        scheduled_at=scheduled_at,
        status='scheduled',
        notes=data.notes or None,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)

    return {
        'id':           appointment.id,
        'patient_name': f'{patient.first_name} {patient.last_name}',
        'service_name': service.name,
        'duration_minutes': service.duration_minutes,
        'price':        service.price,
        'scheduled_at': appointment.scheduled_at.isoformat(),
        'is_new_patient': is_new,
    }
