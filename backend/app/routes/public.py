import re
from collections import defaultdict
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
            continue
        end = appt.scheduled_at + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES)
        intervals.append((appt.scheduled_at, end))
    return intervals


def _has_slots(target_date: date, service_duration: int, busy: list, today: date) -> bool:
    """Return True if at least one slot is open on target_date for the given service."""
    slot_duration = timedelta(minutes=service_duration + BUFFER_MINUTES)
    open_dt  = datetime.combine(target_date, time(OPEN_HOUR, 0))
    close_dt = datetime.combine(target_date, time(CLOSE_HOUR, 0))

    if target_date == today:
        earliest  = datetime.now() + timedelta(hours=MIN_NOTICE_HOURS)
        remainder = earliest.minute % SLOT_MINUTES
        if remainder:
            earliest += timedelta(minutes=SLOT_MINUTES - remainder)
        open_dt = max(open_dt, earliest.replace(second=0, microsecond=0))

    candidate = open_dt
    while candidate + slot_duration <= close_dt:
        candidate_end = candidate + slot_duration
        if not any(candidate < b_end and candidate_end > b_start for b_start, b_end in busy):
            return True
        candidate += timedelta(minutes=SLOT_MINUTES)
    return False


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


# ── Available dates for a month ──────────────────────────────────────────────

@router.get('/available-dates')
@limiter.limit('60/minute')
def get_available_dates(
    request:    Request,
    service_id: int,
    year:       int = Query(...),
    month:      int = Query(..., ge=1, le=12),
    db:         Session = Depends(get_db),
):
    """Return list of YYYY-MM-DD strings that have at least one open slot."""
    service = db.get(Service, service_id)
    if not service or not service.active:
        raise HTTPException(status_code=404, detail='Service not found')

    today      = datetime.now().date()
    max_date   = today + timedelta(days=MAX_DAYS_AHEAD)
    month_start = date(year, month, 1)

    # Last day of the requested month
    if month == 12:
        month_end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)

    # Clamp to [today, max_date]
    check_start = max(month_start, today)
    check_end   = min(month_end, max_date)

    if check_start > check_end:
        return []

    # Load all non-cancelled appointments for the date range.
    # Widen range_start by max service duration so a late appointment from the
    # previous day that bleeds into check_start is included in the busy intervals.
    max_duration  = db.query(Service).with_entities(Service.duration_minutes).order_by(Service.duration_minutes.desc()).first()
    lookback_mins = (max_duration[0] + BUFFER_MINUTES) if max_duration else 120
    range_start   = datetime.combine(check_start, time.min) - timedelta(minutes=lookback_mins)
    range_end     = datetime.combine(check_end, time(23, 59, 59, 999999))
    all_appts   = (
        db.query(Appointment)
        .options(joinedload(Appointment.service))
        .filter(
            Appointment.scheduled_at >= range_start,
            Appointment.scheduled_at <= range_end,
            Appointment.status != 'cancelled',
        )
        .all()
    )

    busy_by_date = defaultdict(list)
    for appt in all_appts:
        if appt.service is None:
            continue
        appt_date = appt.scheduled_at.date()
        end = appt.scheduled_at + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES)
        busy_by_date[appt_date].append((appt.scheduled_at, end))

    available = []
    current = check_start
    while current <= check_end:
        if _has_slots(current, service.duration_minutes, busy_by_date[current], today):
            available.append(current.isoformat())
        current += timedelta(days=1)

    return available


# ── Availability ──────────────────────────────────────────────────────────────

@router.get('/availability')
@limiter.limit('60/minute')
def get_availability(
    request:    Request,
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

    # Re-validate slot is still free.
    # Widen range_start by max service duration to catch appointments from the
    # previous day whose buffer period bleeds into today.
    slot_end        = scheduled_at + timedelta(minutes=service.duration_minutes + BUFFER_MINUTES)
    max_dur         = db.query(Service).with_entities(Service.duration_minutes).order_by(Service.duration_minutes.desc()).first()
    lookback_mins   = (max_dur[0] + BUFFER_MINUTES) if max_dur else 120
    range_start     = scheduled_at.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(minutes=lookback_mins)
    day_end         = scheduled_at.replace(hour=23, minute=59, second=59, microsecond=999999)

    conflicts = (
        db.query(Appointment)
        .options(joinedload(Appointment.service))
        .with_for_update()
        .filter(
            Appointment.scheduled_at >= range_start,
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

    # Phone-based patient lookup (normalize format before matching).
    # Phone is the identity key — if a number matches an existing patient
    # the booking is attached to that record regardless of name/email provided.
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
