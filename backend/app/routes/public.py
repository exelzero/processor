import bisect
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
from app.utils.lru_cache import LRUCache
from app.utils.intervals_cache import intervals_cache as _intervals_cache

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



def _busy_intervals(db: Session, target_date: date) -> list[tuple]:
    """
    Build the occupied time intervals for a given day.

    Returns a list of (start, end) tuples — one per non-cancelled appointment.

    Results are cached in _intervals_cache (LRU, capacity 14) keyed by the
    ISO date string.  Cache hit: O(1) — no DB round-trip.  Cache miss: one
    SELECT with a joinedload, results stored and returned.  The entry is
    invalidated by any write path that modifies appointment data (booking,
    admin create/update/cancel/delete) so the cache never serves stale data.

    Data structure choices:
    - list: ordered, O(1) append, O(n) iteration — appropriate here because we
      always scan every interval when checking for overlaps. Random access by
      index is never needed, so a list beats a dict or set for this shape.
    - tuple (start, end): immutable pair. Tuples are the idiomatic Python choice
      for fixed-structure records; they use less memory than dicts and signal to
      the reader that these two values are always paired and never mutated.

    Trade-off: O(n) overlap scan per candidate slot. Acceptable because the
    maximum appointments per day is ~9 (single esthetician capacity). For a
    multi-practitioner system, an interval tree (O(log n) lookup) would be the
    right upgrade.
    """
    cache_key = target_date.isoformat()
    cached = _intervals_cache.get(cache_key)
    if cached is not LRUCache.MISSING:
        return cached  # [] is a valid hit — a fully-free day is still worth caching

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
    # List of immutable (start, end) tuples — append is O(1), iteration is O(n)
    intervals: list[tuple] = []
    for appt in existing:
        if appt.service is None:
            continue
        end = appt.scheduled_at + timedelta(minutes=appt.service.duration_minutes + BUFFER_MINUTES)
        intervals.append((appt.scheduled_at, end))

    _intervals_cache.put(cache_key, intervals)
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

    # O(s × n) where s = candidate slots in the day, n = busy intervals.
    # Single-practitioner bounds: s ≤ 20 (10 h ÷ 30 min grid), n ≤ ~9.
    # The inner any() short-circuits on first conflict so best case is O(s).
    # Total work is bounded by a small constant — no smarter algorithm needed
    # at this scale.  An interval tree would give O(s log n) but would add
    # complexity with no measurable gain here.
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

    # O(1) queries for the entire month — one SELECT covers every day in the
    # range.  The naive alternative (one query per day) would be O(d) round
    # trips where d ≤ 31.  joinedload(Appointment.service) folds the service
    # data into the same JOIN so accessing appt.service.duration_minutes inside
    # the loop never fires an additional query (eliminates the N+1 problem).
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

    # defaultdict(list) is a hash table whose __missing__ hook calls the factory
    # (list) instead of raising KeyError — each new date key auto-initialises to
    # an empty list so appending never requires an explicit existence check.
    # O(1) average insert and lookup; collisions are resolved by open-addressing
    # (CPython implementation detail, not part of the language spec).
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


# ── Binary-search slot finder ─────────────────────────────────────────────────

def _find_available_slots(
    busy: list[tuple],
    open_dt: datetime,
    close_dt: datetime,
    slot_duration: timedelta,
) -> list[str]:
    """
    Return HH:MM strings for every open slot in [open_dt, close_dt).

    Overlap detection uses binary search instead of a linear scan:

    1. Sort busy intervals by start time once — O(n log n).
    2. Separate into two parallel sorted lists: busy_starts and busy_ends.
    3. For each candidate slot [c, c+d):
       - bisect_right(busy_starts, c) gives position p such that all intervals
         at index < p have start ≤ c, and all at index ≥ p have start > c.
       - After merging, intervals are disjoint, so only two can overlap [c, c+d):
           • index p-1: started at or before c — overlaps if its end > c
           • index p  : starts after c       — overlaps if its start < c+d
         Every other disjoint interval is entirely outside [c, c+d).
       - Each candidate check is O(log n) via bisect vs O(n) for any().

    Overall: O(n log n) sort + O(s log n) checks = O((n+s) log n)
    vs the naive O(s × n), where s = candidate slots (~20/day), n = bookings.

    At single-practitioner scale the difference is negligible, but the pattern
    applies directly to high-volume scheduling systems.
    """
    # Merge overlapping intervals so the two-index proof holds.
    # The binary search invariant "only p-1 and p can overlap [c, c+d)" is only
    # correct when intervals are disjoint.  Two appointments can produce
    # overlapping busy intervals (different start times, different durations),
    # so we merge before building the parallel arrays.
    sorted_busy: list[tuple] = sorted(busy, key=lambda x: x[0])
    merged: list[tuple] = [sorted_busy[0]] if sorted_busy else []
    for s, e in sorted_busy[1:]:
        if s < merged[-1][1]:                              # overlaps previous
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))

    busy_starts = [s for s, _ in merged]
    busy_ends   = [e for _, e in merged]

    slots     = []
    candidate = open_dt
    while candidate + slot_duration <= close_dt:
        c   = candidate
        c_end = candidate + slot_duration
        p   = bisect.bisect_right(busy_starts, c)
        conflict = (
            (p > 0 and busy_ends[p - 1] > c) or
            (p < len(busy_starts) and busy_starts[p] < c_end)
        )
        if not conflict:
            slots.append(c.strftime('%H:%M'))
        candidate += timedelta(minutes=SLOT_MINUTES)  # grid stride, not service length
    return slots


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

    return _find_available_slots(busy, open_dt, close_dt, slot_duration)


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

    # Hash table key canonicalization: strip non-digits before the lookup so
    # every format variant of the same number ("(555) 123-4567", "5551234567",
    # "+15551234567") resolves to the same key.  Python dicts and SQL indexes
    # hash (or sort) on the stored bytes — if format varies between write and
    # read the lookup misses even though the number is logically identical.
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
    # Invalidate immediately after commit — before db.refresh() — so a transient
    # error on refresh cannot leave a committed appointment invisible in the cache.
    _intervals_cache.invalidate(scheduled_at.date().isoformat())
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
