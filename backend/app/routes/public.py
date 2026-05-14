import re
from datetime import datetime, date, time, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, EmailStr, Field

from app.database import get_db
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service
from app.limiter import limiter

router = APIRouter()

OPEN_HOUR        = 9   # 9 AM
CLOSE_HOUR       = 19  # 7 PM
BUFFER_MINUTES   = 10
SLOT_MINUTES     = 30  # slots offered every 30 min
MIN_NOTICE_HOURS = 1   # must book at least 1 hour ahead
MAX_DAYS_AHEAD   = 60  # booking window


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_phone(raw: str) -> str:
    """Strip all non-digit characters so format variants match the same record."""
    return re.sub(r'\D', '', raw)


def _is_valid_slot(dt: datetime) -> bool:
    """Return True if dt falls within business hours and on a SLOT_MINUTES boundary."""
    if dt.hour < OPEN_HOUR or dt.hour >= CLOSE_HOUR:
        return False
    if dt.minute % SLOT_MINUTES != 0 or dt.second != 0 or dt.microsecond != 0:
        return False
    slot_end = dt + timedelta(minutes=SLOT_MINUTES)  # minimum duration check
    return slot_end.replace(hour=dt.hour, minute=dt.minute) <= datetime.combine(dt.date(), time(CLOSE_HOUR, 0))


def _busy_intervals(db: Session, target_date: date):
    """Return [(start, end)] for all non-cancelled appointments on target_date."""
    day_start = datetime.combine(target_date, time.min)
    day_end   = datetime.combine(target_date, time(23, 59, 59, 999999))
    existing  = (
        db.query(Appointment)
        .options(joinedload(Appointment.service))
        .filter(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at <= day_end,
            Appointment.status != 'cancelled',
        )
        .all()
    )
    intervals = []
    for appt in existing:
        if appt.service is None:
            continue  # orphaned appointment — skip rather than crash
        end = appt.scheduled_at + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES)
        intervals.append((appt.scheduled_at, end))
    return intervals


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
        raise HTTPException(status_code=400, detail='Cannot request availability for a past date')
    if (date - today).days > MAX_DAYS_AHEAD:
        raise HTTPException(status_code=400, detail=f'Cannot book more than {MAX_DAYS_AHEAD} days in advance')

    busy          = _busy_intervals(db, date)
    slot_duration = timedelta(minutes=service.duration_minutes + BUFFER_MINUTES)
    open_dt       = datetime.combine(date, time(OPEN_HOUR, 0))
    close_dt      = datetime.combine(date, time(CLOSE_HOUR, 0))

    if date == today:
        earliest  = datetime.now() + timedelta(hours=MIN_NOTICE_HOURS)
        remainder = earliest.minute % SLOT_MINUTES
        if remainder:
            earliest += timedelta(minutes=SLOT_MINUTES - remainder)
        open_dt = max(open_dt, earliest.replace(second=0, microsecond=0))

    slots     = []
    candidate = open_dt
    while candidate + slot_duration <= close_dt:
        candidate_end = candidate + slot_duration
        if not any(candidate < b_end and candidate_end > b_start for b_start, b_end in busy):
            slots.append(candidate.strftime('%H:%M'))
        candidate += timedelta(minutes=SLOT_MINUTES)

    return slots


# ── Book appointment ──────────────────────────────────────────────────────────

class BookIn(BaseModel):
    service_id: int
    date:       str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')
    time:       str = Field(..., pattern=r'^\d{2}:\d{2}$')
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name:  str = Field(..., min_length=1, max_length=100)
    phone:      str = Field(..., min_length=7, max_length=30)
    email:      EmailStr
    notes:      Optional[str] = Field(None, max_length=1000)


@router.post('/book', status_code=201)
@limiter.limit('10/hour')
def book_appointment(request: Request, data: BookIn, db: Session = Depends(get_db)):
    # Validate service
    service = db.get(Service, data.service_id)
    if not service or not service.active:
        raise HTTPException(status_code=404, detail='Service not found')

    # Parse and validate slot datetime
    try:
        scheduled_at = datetime.fromisoformat(f'{data.date}T{data.time}:00')
    except ValueError:
        raise HTTPException(status_code=400, detail='Invalid date or time format')

    # Business hours and slot-boundary check
    if scheduled_at.hour < OPEN_HOUR or scheduled_at.hour >= CLOSE_HOUR:
        raise HTTPException(status_code=400, detail=f'Booking must be within business hours ({OPEN_HOUR}:00–{CLOSE_HOUR}:00)')
    if scheduled_at.minute % SLOT_MINUTES != 0:
        raise HTTPException(status_code=400, detail=f'Time must fall on a {SLOT_MINUTES}-minute boundary')

    today = datetime.now().date()
    if scheduled_at.date() < today:
        raise HTTPException(status_code=400, detail='Cannot book a slot in the past')
    if (scheduled_at.date() - today).days > MAX_DAYS_AHEAD:
        raise HTTPException(status_code=400, detail=f'Cannot book more than {MAX_DAYS_AHEAD} days in advance')
    if scheduled_at < datetime.now() + timedelta(hours=MIN_NOTICE_HOURS):
        raise HTTPException(status_code=400, detail='Please book at least 1 hour in advance')

    # Re-validate slot is still free
    slot_end  = scheduled_at + timedelta(minutes=service.duration_minutes + BUFFER_MINUTES)
    day_start = scheduled_at.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = scheduled_at.replace(hour=23, minute=59, second=59, microsecond=999999)

    conflicts = (
        db.query(Appointment)
        .options(joinedload(Appointment.service))
        .with_for_update(skip_locked=True)
        .filter(
            Appointment.scheduled_at >= day_start,
            Appointment.scheduled_at <= day_end,
            Appointment.status != 'cancelled',
        )
        .all()
    )

    for appt in conflicts:
        if appt.service is None:
            continue
        b_start = appt.scheduled_at
        b_end   = b_start + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES)
        if scheduled_at < b_end and slot_end > b_start:
            raise HTTPException(status_code=409, detail='This time slot is no longer available. Please choose another.')

    # Phone-based patient lookup (normalize format before matching)
    phone_clean = _normalize_phone(data.phone)
    patient     = db.query(Patient).filter(Patient.phone == phone_clean).first()
    is_new      = patient is None

    if is_new:
        # Generic error to avoid email enumeration
        email_taken = db.query(Patient).filter(Patient.email == str(data.email)).first()
        if email_taken:
            raise HTTPException(
                status_code=400,
                detail='Please check your details and try again.',
            )
        patient = Patient(
            first_name=data.first_name.strip(),
            last_name=data.last_name.strip(),
            email=str(data.email).strip(),
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
        'id':               appointment.id,
        'patient_name':     f'{patient.first_name} {patient.last_name}',
        'service_name':     service.name,
        'duration_minutes': service.duration_minutes,
        'price':            service.price,
        'scheduled_at':     appointment.scheduled_at.isoformat(),
        'is_new_patient':   is_new,
    }
