from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case

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
        # INNER JOIN — only rows where both sides match are kept.
        # An appointment without a matching service row is excluded.
        # Emits: FROM appointments JOIN services ON services.id = appointments.service_id
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

    CTE vs subquery:
      Both express a named intermediate result set.  The difference is scope
      and readability, not performance (SQLite's query planner treats them
      identically; Postgres may materialise a CTE once and reuse it).

      Subquery  — anonymous inline expression.  The DB sees it once, but the
                  Python source buries it inside the outer query.  If you need
                  the same result twice you must repeat the .subquery() call or
                  alias it manually.

      CTE (WITH clause) — named at the top of the SQL statement.  Every
                  reference to the CTE name within that statement reuses the
                  same definition.  In EXPLAIN output the CTE appears by name,
                  making query plans easier to read.  In SQLAlchemy, .cte()
                  returns a named subquery object whose columns are accessed
                  the same way as .subquery().

    Here first_appt_cte is referenced only once, so the practical difference
    is clarity: the CTE name makes the intent explicit in both Python and the
    emitted SQL ("WITH first_appt AS (...)").
    """
    # Per-patient earliest appointment month.
    # .cte() emits: WITH first_appt AS (SELECT ... FROM appointments GROUP BY patient_id)
    # The outer query then references it by name rather than as an anonymous inline view.
    first_appt_cte = (
        db.query(
            func.strftime('%Y-%m', func.min(Appointment.scheduled_at)).label('month'),  # SQLite only
            Appointment.patient_id,
        )
        .group_by(Appointment.patient_id)
        .cte(name='first_appt')
    )
    growth_rows = (
        db.query(
            first_appt_cte.c.month,
            func.count().label('new_clients'),
        )
        .group_by(first_appt_cte.c.month)
        .order_by(first_appt_cte.c.month)
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

    # Top 10 clients by completed revenue.
    # Two chained INNER JOINs: Patient → Appointment → Service.
    # Patients with no completed appointments (or whose appointments have no
    # matching service) are excluded from both the count and the revenue sum.
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


@router.get('/service-utilization')
def service_utilization(db: Session = Depends(get_db), _=Depends(verify_token)):
    """
    All services with their booking counts — including services never booked.

    INNER JOIN vs LEFT OUTER JOIN:
      INNER JOIN  — keeps only rows where both sides match.  A service with
                    zero appointments would be dropped entirely.
      LEFT OUTER JOIN — keeps every row from the left table (Service) and fills
                    appointment columns with NULL when there is no match.
                    Services never booked appear with count=0 instead of being
                    silently excluded.

    SQLAlchemy's .join() emits INNER JOIN by default.
    Passing isouter=True (or using .outerjoin()) switches to LEFT OUTER JOIN:

      SELECT services.name, services.category, COUNT(appointments.id)
      FROM services
      LEFT OUTER JOIN appointments ON appointments.service_id = services.id
      GROUP BY services.id
    """
    rows = (
        db.query(
            Service.name,
            Service.category,
            Service.price,
            func.count(Appointment.id).label('total_bookings'),
            func.sum(
                # case() is portable across all SQL backends (SQLite, Postgres, MySQL).
                # func.iif() works only on SQLite ≥ 3.32 and SQL Server.
                case((Appointment.status == 'completed', 1), else_=0)
            ).label('completed'),
        )
        # isouter=True → LEFT OUTER JOIN: services with no appointments are
        # retained with Appointment columns NULL, so COUNT(appointments.id)
        # yields 0 (COUNT ignores NULLs) rather than omitting the service.
        .outerjoin(Appointment, Appointment.service_id == Service.id)
        .group_by(Service.id)
        .order_by(func.count(Appointment.id).desc())
        .all()
    )
    return [
        {
            'service': r.name,
            'category': r.category,
            'price': r.price,
            'total_bookings': r.total_bookings,
            'completed': r.completed or 0,
        }
        for r in rows
    ]


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
