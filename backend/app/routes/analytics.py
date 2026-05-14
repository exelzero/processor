from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service
from app.utils.sequences import find_gaps

router = APIRouter()

WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']


@router.get("/revenue-trend")
def revenue_trend(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Monthly revenue and appointment volume from completed appointments."""
    rows = (
        db.query(
            func.strftime('%Y-%m', Appointment.scheduled_at).label('month'),  # SQLite only
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
        .group_by(func.strftime('%Y-%m', Appointment.scheduled_at))
        .order_by(func.strftime('%Y-%m', Appointment.scheduled_at))
        .all()
    )
    data = [{'month': r.month, 'revenue': round(r.revenue, 2), 'count': r.count} for r in rows if r.month]
    avg = round(sum(r['revenue'] for r in data) / len(data), 2) if data else 0
    return {'by_month': data, 'avg_monthly_revenue': avg}


@router.get("/category-mix")
def category_mix(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Revenue and booking count by service category (completed only)."""
    rows = (
        db.query(
            Service.category,
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
        .group_by(Service.category)
        .order_by(func.sum(Service.price).desc())
        .all()
    )
    return [{'category': r.category, 'revenue': round(r.revenue, 2), 'count': r.count} for r in rows]


@router.get("/status-trend")
def status_trend(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Monthly appointment counts broken down by status (all statuses)."""
    rows = (
        db.query(
            func.strftime('%Y-%m', Appointment.scheduled_at).label('month'),  # SQLite only
            Appointment.status,
            func.count(Appointment.id).label('count'),
        )
        .group_by(
            func.strftime('%Y-%m', Appointment.scheduled_at),
            Appointment.status,
        )
        .order_by(func.strftime('%Y-%m', Appointment.scheduled_at))
        .all()
    )

    # Hash-table pivot: defaultdict(lambda: {...}) auto-initialises a fresh status
    # dict per month key.  The lambda — rather than a shared mutable default — ensures
    # each key gets its own independent dict.  Lookup and insertion are O(1) average,
    # so the full pivot over n query rows is O(n).  A nested loop approach would be
    # O(n × s) where s = number of statuses; the dict makes that unnecessary.
    pivot = defaultdict(lambda: {'completed': 0, 'cancelled': 0, 'no-show': 0, 'scheduled': 0})
    for r in rows:
        if r.month:
            pivot[r.month][r.status] = r.count

    total_past = sum(
        v['completed'] + v['cancelled'] + v['no-show']
        for v in pivot.values()
        if v['completed'] + v['cancelled'] + v['no-show'] > 0
    )
    total_cancelled = sum(v['cancelled'] for v in pivot.values())
    total_no_show = sum(v['no-show'] for v in pivot.values())

    return {
        'by_month': [
            {'month': month, **counts}
            for month, counts in sorted(pivot.items())
        ],
        'cancellation_rate': round(total_cancelled / total_past * 100, 1) if total_past else 0,
        'no_show_rate': round(total_no_show / total_past * 100, 1) if total_past else 0,
    }


@router.get("/schedule-patterns")
def schedule_patterns(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Appointment distribution by day of week and hour of day."""
    weekday_rows = (
        db.query(
            func.strftime('%w', Appointment.scheduled_at).label('dow'),  # SQLite only; 0=Sun
            func.count(Appointment.id).label('count'),
        )
        .group_by(func.strftime('%w', Appointment.scheduled_at))
        .all()
    )
    by_weekday = [
        {'day': WEEKDAY_LABELS[int(r.dow)], 'count': r.count}
        for r in sorted(weekday_rows, key=lambda r: int(r.dow))
        if r.dow is not None
    ]

    hour_rows = (
        db.query(
            func.strftime('%H', Appointment.scheduled_at).label('hour'),  # SQLite only
            func.count(Appointment.id).label('count'),
        )
        .group_by(func.strftime('%H', Appointment.scheduled_at))
        .order_by(func.strftime('%H', Appointment.scheduled_at))
        .all()
    )
    by_hour = [
        {'hour': f"{int(r.hour)}{'am' if int(r.hour) < 12 else 'pm'}", 'count': r.count}
        for r in hour_rows
        if r.hour is not None
    ]

    return {'by_weekday': by_weekday, 'by_hour': by_hour}


@router.get("/service-performance")
def service_performance(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Each service ranked by revenue and booking count (completed only)."""
    rows = (
        db.query(
            Service.name,
            Service.category,
            Service.price,
            func.count(Appointment.id).label('count'),
            func.sum(Service.price).label('revenue'),
        )
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
        .group_by(Service.id)
        .order_by(func.sum(Service.price).desc())
        .all()
    )
    return [
        {
            'service': r.name,
            'category': r.category,
            'price': r.price,
            'count': r.count,
            'revenue': round(r.revenue, 2),
        }
        for r in rows
    ]


@router.get("/client-insights")
def client_insights(db: Session = Depends(get_db), _=Depends(verify_token)):
    """
    New client acquisition by month (first appointment date), skin type
    distribution, and single-visit vs returning breakdown.
    """
    # New clients: group by month of each patient's first appointment
    first_appt_rows = (
        db.query(
            func.strftime('%Y-%m', func.min(Appointment.scheduled_at)).label('month'),  # SQLite only
            func.count(Appointment.patient_id).label('new_clients'),
        )
        .group_by(Appointment.patient_id)
        .subquery()
    )
    growth_rows = (
        db.query(
            first_appt_rows.c.month,
            func.count().label('new_clients'),
        )
        .group_by(first_appt_rows.c.month)
        .order_by(first_appt_rows.c.month)
        .all()
    )
    cumulative = 0
    growth = []
    for r in growth_rows:
        if r.month:
            cumulative += r.new_clients
            growth.append({'month': r.month, 'new_clients': r.new_clients, 'cumulative': cumulative})

    # Skin type distribution
    skin_rows = (
        db.query(Patient.skin_type, func.count(Patient.id).label('count'))
        .group_by(Patient.skin_type)
        .order_by(func.count(Patient.id).desc())
        .all()
    )
    skin_types = [{'skin_type': r.skin_type or 'Unknown', 'count': r.count} for r in skin_rows]

    # Retention: patients with 1 visit vs 2+
    visit_counts = (
        db.query(func.count(Appointment.id).label('visits'))
        .group_by(Appointment.patient_id)
        .all()
    )
    one_time = sum(1 for r in visit_counts if r.visits == 1)
    returning = sum(1 for r in visit_counts if r.visits > 1)

    # Top 10 clients by completed revenue
    top_rows = (
        db.query(
            Patient.first_name,
            Patient.last_name,
            func.count(Appointment.id).label('visits'),
            func.sum(Service.price).label('revenue'),
        )
        .join(Appointment, Appointment.patient_id == Patient.id)
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
        .group_by(Patient.id)
        .order_by(func.sum(Service.price).desc())
        .limit(10)
        .all()
    )
    top_clients = [
        {'name': f"{r.first_name} {r.last_name}", 'visits': r.visits, 'revenue': round(r.revenue, 2)}
        for r in top_rows
    ]

    return {
        'growth': growth,
        'skin_types': skin_types,
        'retention': {'one_time': one_time, 'returning': returning},
        'top_clients': top_clients,
    }


@router.get('/sequence-gaps')
def sequence_gaps(db: Session = Depends(get_db), _=Depends(verify_token)):
    """
    Audit integer ID continuity across core tables.

    Uses find_gaps() — a set-membership scan — to detect missing IDs that
    indicate soft-deleted or skipped records.  Each table's IDs are fetched
    in a single scalar query (O(n) rows), converted to a set (O(n)), then
    scanned over the full range (O(range_size)) with O(1) membership checks.

    A gap doesn't always signal a problem (auto-increment skips on rollback
    are normal), but large or clustered gaps can indicate bulk deletes or
    data-import issues worth investigating.
    """
    # List comprehensions — eager, O(n) memory, returns a concrete list whose
    # len() is O(1).  A generator expression (r[0] for r in ...) would be lazy
    # (O(1) memory) but can only be iterated once and has no len(), which would
    # require a second pass to count.  len() on the list is used twice below, so
    # a list is the right choice here.
    appt_ids    = [r[0] for r in db.query(Appointment.id).all()]
    patient_ids = [r[0] for r in db.query(Patient.id).all()]

    appt_gaps    = find_gaps(appt_ids)
    patient_gaps = find_gaps(patient_ids)

    return {
        'appointments': {
            'total':    len(appt_ids),
            'gaps':      appt_gaps,
            'gap_count': len(appt_gaps),
        },
        'patients': {
            'total':    len(patient_ids),
            'gaps':      patient_gaps,
            'gap_count': len(patient_gaps),
        },
    }
