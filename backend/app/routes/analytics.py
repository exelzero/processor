from collections import defaultdict
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service

router = APIRouter()

WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']


def _date_filter(query, start: Optional[date], end: Optional[date]):
    """Restrict Appointment.scheduled_at to [start, end] inclusive."""
    if start:
        query = query.filter(Appointment.scheduled_at >= datetime.combine(start, time.min))
    if end:
        query = query.filter(Appointment.scheduled_at <= datetime.combine(end, time.max))
    return query


@router.get("/revenue-trend")
def revenue_trend(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Monthly revenue and appointment volume from completed appointments."""
    q = (
        db.query(
            func.strftime('%Y-%m', Appointment.scheduled_at).label('month'),  # SQLite only
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    q = _date_filter(q, start, end)
    rows = q.group_by(func.strftime('%Y-%m', Appointment.scheduled_at)).order_by(func.strftime('%Y-%m', Appointment.scheduled_at)).all()
    data = [{'month': r.month, 'revenue': round(r.revenue, 2), 'count': r.count} for r in rows if r.month]
    avg = round(sum(r['revenue'] for r in data) / len(data), 2) if data else 0
    return {'by_month': data, 'avg_monthly_revenue': avg}


@router.get("/category-mix")
def category_mix(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Revenue and booking count by service category (completed only)."""
    q = (
        db.query(
            Service.category,
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    q = _date_filter(q, start, end)
    rows = q.group_by(Service.category).order_by(func.sum(Service.price).desc()).all()
    return [{'category': r.category, 'revenue': round(r.revenue, 2), 'count': r.count} for r in rows]


@router.get("/status-trend")
def status_trend(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Monthly appointment counts broken down by status (all statuses)."""
    q = db.query(
        func.strftime('%Y-%m', Appointment.scheduled_at).label('month'),  # SQLite only
        Appointment.status,
        func.count(Appointment.id).label('count'),
    )
    q = _date_filter(q, start, end)
    rows = (
        q.group_by(func.strftime('%Y-%m', Appointment.scheduled_at), Appointment.status)
         .order_by(func.strftime('%Y-%m', Appointment.scheduled_at))
         .all()
    )

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
    total_no_show   = sum(v['no-show']   for v in pivot.values())

    return {
        'by_month': [{'month': month, **counts} for month, counts in sorted(pivot.items())],
        'cancellation_rate': round(total_cancelled / total_past * 100, 1) if total_past else 0,
        'no_show_rate':      round(total_no_show   / total_past * 100, 1) if total_past else 0,
    }


@router.get("/schedule-patterns")
def schedule_patterns(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Appointment distribution by day of week and hour of day."""
    weekday_q = db.query(
        func.strftime('%w', Appointment.scheduled_at).label('dow'),  # SQLite only; 0=Sun
        func.count(Appointment.id).label('count'),
    )
    weekday_q = _date_filter(weekday_q, start, end)
    weekday_rows = weekday_q.group_by(func.strftime('%w', Appointment.scheduled_at)).all()
    by_weekday = [
        {'day': WEEKDAY_LABELS[int(r.dow)], 'count': r.count}
        for r in sorted(weekday_rows, key=lambda r: int(r.dow))
        if r.dow is not None
    ]

    hour_q = db.query(
        func.strftime('%H', Appointment.scheduled_at).label('hour'),  # SQLite only
        func.count(Appointment.id).label('count'),
    )
    hour_q = _date_filter(hour_q, start, end)
    hour_rows = hour_q.group_by(func.strftime('%H', Appointment.scheduled_at)).order_by(func.strftime('%H', Appointment.scheduled_at)).all()
    by_hour = [
        {'hour': f"{int(r.hour)}{'am' if int(r.hour) < 12 else 'pm'}", 'count': r.count}
        for r in hour_rows
        if r.hour is not None
    ]

    return {'by_weekday': by_weekday, 'by_hour': by_hour}


@router.get("/service-performance")
def service_performance(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Each service ranked by revenue and booking count (completed only)."""
    q = (
        db.query(
            Service.name,
            Service.category,
            Service.price,
            func.count(Appointment.id).label('count'),
            func.sum(Service.price).label('revenue'),
        )
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    q = _date_filter(q, start, end)
    rows = q.group_by(Service.id).order_by(func.sum(Service.price).desc()).all()
    return [
        {'service': r.name, 'category': r.category, 'price': r.price, 'count': r.count, 'revenue': round(r.revenue, 2)}
        for r in rows
    ]


@router.get("/client-insights")
def client_insights(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """
    New client acquisition, skin type distribution, retention, and top clients.
    Date range filters all appointment-based queries.
    A "new client" is one whose first-ever appointment falls within the range.
    """
    start_dt = datetime.combine(start, time.min) if start else None
    end_dt   = datetime.combine(end,   time.max) if end   else None

    # New clients — patients whose first-ever appointment is in the range
    first_appt_subq = (
        db.query(
            Appointment.patient_id,
            func.min(Appointment.scheduled_at).label('first_appt'),
        )
        .group_by(Appointment.patient_id)
        .subquery()
    )
    growth_q = db.query(
        func.strftime('%Y-%m', first_appt_subq.c.first_appt).label('month'),  # SQLite only
        func.count().label('new_clients'),
    )
    if start_dt:
        growth_q = growth_q.filter(first_appt_subq.c.first_appt >= start_dt)
    if end_dt:
        growth_q = growth_q.filter(first_appt_subq.c.first_appt <= end_dt)
    growth_rows = (
        growth_q
        .group_by(func.strftime('%Y-%m', first_appt_subq.c.first_appt))
        .order_by(func.strftime('%Y-%m', first_appt_subq.c.first_appt))
        .all()
    )
    cumulative = 0
    growth = []
    for r in growth_rows:
        if r.month:
            cumulative += r.new_clients
            growth.append({'month': r.month, 'new_clients': r.new_clients, 'cumulative': cumulative})

    # Skin types — among patients who had an appointment in the range
    appt_in_range_q = db.query(Appointment.patient_id).distinct()
    if start_dt:
        appt_in_range_q = appt_in_range_q.filter(Appointment.scheduled_at >= start_dt)
    if end_dt:
        appt_in_range_q = appt_in_range_q.filter(Appointment.scheduled_at <= end_dt)
    patient_ids_in_range = appt_in_range_q.subquery()
    skin_rows = (
        db.query(Patient.skin_type, func.count(Patient.id).label('count'))
        .filter(Patient.id.in_(patient_ids_in_range))
        .group_by(Patient.skin_type)
        .order_by(func.count(Patient.id).desc())
        .all()
    )
    skin_types = [{'skin_type': r.skin_type or 'Unknown', 'count': r.count} for r in skin_rows]

    # Retention — visits per patient within the range
    retention_q = db.query(Appointment.patient_id, func.count(Appointment.id).label('visits'))
    if start_dt:
        retention_q = retention_q.filter(Appointment.scheduled_at >= start_dt)
    if end_dt:
        retention_q = retention_q.filter(Appointment.scheduled_at <= end_dt)
    visit_counts = retention_q.group_by(Appointment.patient_id).all()
    one_time  = sum(1 for r in visit_counts if r.visits == 1)
    returning = sum(1 for r in visit_counts if r.visits > 1)

    # Top 10 clients — completed revenue within the range
    top_q = (
        db.query(
            Patient.first_name,
            Patient.last_name,
            func.count(Appointment.id).label('visits'),
            func.sum(Service.price).label('revenue'),
        )
        .join(Appointment, Appointment.patient_id == Patient.id)
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    if start_dt:
        top_q = top_q.filter(Appointment.scheduled_at >= start_dt)
    if end_dt:
        top_q = top_q.filter(Appointment.scheduled_at <= end_dt)
    top_rows = top_q.group_by(Patient.id).order_by(func.sum(Service.price).desc()).limit(10).all()
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
