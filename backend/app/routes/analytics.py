from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import cast, func, case, String

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.service import Service
from app.models.sale import Sale, SaleItem
from app.models.product import Product
from app.models.expense import Expense
from app.utils.sequences import find_gaps

router = APIRouter()

WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']


def _start_dt(period: str) -> Optional[datetime]:
    """Return the inclusive start datetime for the requested period, or None for all-time."""
    today = date.today()
    if period == 'ytd':
        start = date(today.year, 1, 1)
    elif period in ('30d', '60d', '90d', '120d'):
        start = today - timedelta(days=int(period[:-1]))
    else:
        return None
    return datetime(start.year, start.month, start.day)


@router.get("/revenue-trend")
def revenue_trend(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    """Monthly revenue and appointment volume from completed appointments."""
    start = _start_dt(period)
    q = (
        db.query(
            func.strftime('%Y-%m', Appointment.scheduled_at).label('month'),
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    if start:
        q = q.filter(Appointment.scheduled_at >= start)
    rows = q.group_by(func.strftime('%Y-%m', Appointment.scheduled_at)).order_by(func.strftime('%Y-%m', Appointment.scheduled_at)).all()
    data = [{'month': r.month, 'revenue': round(r.revenue, 2), 'count': r.count} for r in rows if r.month]
    avg = round(sum(r['revenue'] for r in data) / len(data), 2) if data else 0
    return {'by_month': data, 'avg_monthly_revenue': avg}


@router.get("/category-mix")
def category_mix(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    """Revenue and booking count by service category (completed only)."""
    start = _start_dt(period)
    q = (
        db.query(
            Service.category,
            func.sum(Service.price).label('revenue'),
            func.count(Appointment.id).label('count'),
        )
        .join(Appointment, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    if start:
        q = q.filter(Appointment.scheduled_at >= start)
    rows = q.group_by(Service.category).order_by(func.sum(Service.price).desc()).all()
    return [{'category': r.category, 'revenue': round(r.revenue, 2), 'count': r.count} for r in rows]


@router.get("/status-trend")
def status_trend(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    """Monthly appointment counts broken down by status."""
    start = _start_dt(period)
    q = db.query(
        func.strftime('%Y-%m', Appointment.scheduled_at).label('month'),
        Appointment.status,
        func.count(Appointment.id).label('count'),
    )
    if start:
        q = q.filter(Appointment.scheduled_at >= start)
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
def schedule_patterns(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    """Appointment distribution by day of week and hour of day."""
    start = _start_dt(period)

    wq = db.query(func.strftime('%w', Appointment.scheduled_at).label('dow'), func.count(Appointment.id).label('count'))
    if start:
        wq = wq.filter(Appointment.scheduled_at >= start)
    weekday_rows = wq.group_by(func.strftime('%w', Appointment.scheduled_at)).all()
    by_weekday = [
        {'day': WEEKDAY_LABELS[int(r.dow)], 'count': r.count}
        for r in sorted(weekday_rows, key=lambda r: int(r.dow))
        if r.dow is not None
    ]

    hq = db.query(func.strftime('%H', Appointment.scheduled_at).label('hour'), func.count(Appointment.id).label('count'))
    if start:
        hq = hq.filter(Appointment.scheduled_at >= start)
    hour_rows = hq.group_by(func.strftime('%H', Appointment.scheduled_at)).order_by(func.strftime('%H', Appointment.scheduled_at)).all()
    by_hour = [
        {'hour': f"{int(r.hour)}{'am' if int(r.hour) < 12 else 'pm'}", 'count': r.count}
        for r in hour_rows if r.hour is not None
    ]

    return {'by_weekday': by_weekday, 'by_hour': by_hour}


@router.get("/service-performance")
def service_performance(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    """Each service ranked by revenue and booking count (completed only)."""
    start = _start_dt(period)
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
    if start:
        q = q.filter(Appointment.scheduled_at >= start)
    rows = q.group_by(Service.id).order_by(func.sum(Service.price).desc()).all()
    return [
        {'service': r.name, 'category': r.category, 'price': r.price, 'count': r.count, 'revenue': round(r.revenue, 2)}
        for r in rows
    ]


@router.get("/client-insights")
def client_insights(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    """
    New client acquisition by month (first appointment date), skin type
    distribution, and single-visit vs returning breakdown.

    CTE vs subquery:
      Both express a named intermediate result set.  The difference is scope
      and readability, not performance (both SQLite and Postgres 12+ inline
      CTEs into the query plan by default, identical to a subquery; Postgres
      forced materialisation requires the explicit MATERIALIZED keyword, which
      SQLAlchemy does not emit).

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

    Here the CTE's month column is referenced three times in the outer query
    (SELECT, GROUP BY, ORDER BY).  The practical benefit is clarity: the name
    "first_appt" makes the intent explicit in both Python and the emitted SQL
    ("WITH first_appt AS (...)").
    """
    start = _start_dt(period)

    first_appt_q = (
        db.query(
            func.strftime('%Y-%m', func.min(Appointment.scheduled_at)).label('month'),
            Appointment.patient_id,
        )
        .group_by(Appointment.patient_id)
    )
    if start:
        first_appt_q = first_appt_q.filter(Appointment.scheduled_at >= start)
    first_appt_cte = first_appt_q.cte(name='first_appt')

    growth_rows = (
        db.query(first_appt_cte.c.month, func.count().label('new_clients'))
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

    skin_rows = (
        db.query(Patient.skin_type, func.count(Patient.id).label('count'))
        .group_by(Patient.skin_type)
        .order_by(func.count(Patient.id).desc())
        .all()
    )
    skin_types = [{'skin_type': r.skin_type or 'Unknown', 'count': r.count} for r in skin_rows]

    visit_q = db.query(func.count(Appointment.id).label('visits')).group_by(Appointment.patient_id)
    if start:
        visit_q = visit_q.filter(Appointment.scheduled_at >= start)
    visit_counts = visit_q.all()
    one_time  = sum(1 for r in visit_counts if r.visits == 1)
    returning = sum(1 for r in visit_counts if r.visits > 1)

    top_q = (
        db.query(
            Patient.first_name, Patient.last_name,
            func.count(Appointment.id).label('visits'),
            func.sum(Service.price).label('revenue'),
        )
        .join(Appointment, Appointment.patient_id == Patient.id)
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == 'completed')
    )
    if start:
        top_q = top_q.filter(Appointment.scheduled_at >= start)
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


@router.get('/service-utilization')
def service_utilization(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
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
    Passing isouter=True (or using .outerjoin()) switches to LEFT OUTER JOIN.
    """
    start = _start_dt(period)
    appt_alias = Appointment
    q = (
        db.query(
            Service.name,
            Service.category,
            Service.price,
            func.count(appt_alias.id).label('total_bookings'),
            func.sum(case((appt_alias.status == 'completed', 1), else_=0)).label('completed'),
        )
        .outerjoin(appt_alias, appt_alias.service_id == Service.id)
    )
    if start:
        q = q.filter((appt_alias.scheduled_at == None) | (appt_alias.scheduled_at >= start))
    rows = q.group_by(Service.id).order_by(func.count(appt_alias.id).desc()).all()
    return [
        {'service': r.name, 'category': r.category, 'price': r.price, 'total_bookings': r.total_bookings, 'completed': r.completed or 0}
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
    """
    appt_ids    = [r[0] for r in db.query(Appointment.id).all()]
    patient_ids = [r[0] for r in db.query(Patient.id).all()]
    appt_gaps    = find_gaps(appt_ids)
    patient_gaps = find_gaps(patient_ids)
    return {
        'appointments': {'total': len(appt_ids),    'gaps': appt_gaps,    'gap_count': len(appt_gaps)},
        'patients':     {'total': len(patient_ids), 'gaps': patient_gaps, 'gap_count': len(patient_gaps)},
    }


@router.get('/product-sales')
def product_sales(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    start = _start_dt(period)

    sale_filter = [Sale.status.in_(['completed', 'partially_refunded'])]
    if start:
        sale_filter.append(Sale.sale_date >= start)

    total_transactions = db.query(func.count(Sale.id)).filter(*sale_filter).scalar()
    total_revenue = float(db.query(func.sum(Sale.total)).filter(*sale_filter).scalar() or 0.0)
    avg_sale_value = round(total_revenue / total_transactions, 2) if total_transactions else 0.0

    by_month = (
        db.query(
            func.substr(cast(Sale.sale_date, String), 1, 7).label('month'),
            func.sum(Sale.total).label('revenue'),
            func.count(Sale.id).label('transactions'),
        )
        .filter(*sale_filter)
        .group_by(func.substr(cast(Sale.sale_date, String), 1, 7))
        .order_by(func.substr(cast(Sale.sale_date, String), 1, 7))
        .all()
    )

    not_refunded = [Sale.status != 'refunded']
    if start:
        not_refunded.append(Sale.sale_date >= start)

    top_by_revenue = (
        db.query(Product.name, func.sum(SaleItem.quantity).label('units'), func.sum(SaleItem.total).label('revenue'))
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(*not_refunded)
        .group_by(Product.id, Product.name)
        .order_by(func.sum(SaleItem.total).desc())
        .limit(8)
        .all()
    )
    top_by_units = (
        db.query(Product.name, func.sum(SaleItem.quantity).label('units'), func.sum(SaleItem.total).label('revenue'))
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(*not_refunded)
        .group_by(Product.id, Product.name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(8)
        .all()
    )

    return {
        'total_transactions': total_transactions,
        'total_revenue': round(total_revenue, 2),
        'avg_sale_value': avg_sale_value,
        'by_month': [{'month': r.month, 'revenue': round(float(r.revenue), 2), 'transactions': r.transactions} for r in by_month],
        'top_by_revenue': [{'name': r.name, 'units': int(r.units), 'revenue': round(float(r.revenue), 2)} for r in top_by_revenue],
        'top_by_units':   [{'name': r.name, 'units': int(r.units), 'revenue': round(float(r.revenue), 2)} for r in top_by_units],
    }


@router.get('/expenses')
def expenses_analytics(period: str = Query('ytd'), db: Session = Depends(get_db), _=Depends(verify_token)):
    start = _start_dt(period)
    start_date = start.date() if start else None  # expense_date is a Date column

    base_filter = [Expense.expense_date >= start_date] if start_date else []

    total = float(db.query(func.sum(Expense.amount)).filter(*base_filter).scalar() or 0.0)

    by_month = (
        db.query(func.substr(cast(Expense.expense_date, String), 1, 7).label('month'), func.sum(Expense.amount).label('amount'))
        .filter(*base_filter)
        .group_by(func.substr(cast(Expense.expense_date, String), 1, 7))
        .order_by(func.substr(cast(Expense.expense_date, String), 1, 7))
        .all()
    )
    by_category = (
        db.query(Expense.category, func.sum(Expense.amount).label('amount'), func.count(Expense.id).label('count'))
        .filter(*base_filter)
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )

    months = len(by_month)
    return {
        'total': round(total, 2),
        'avg_monthly': round(total / months, 2) if months else 0.0,
        'top_category': by_category[0].category if by_category else None,
        'by_month':    [{'month': r.month, 'amount': round(float(r.amount), 2)} for r in by_month],
        'by_category': [{'category': r.category, 'amount': round(float(r.amount), 2), 'count': r.count} for r in by_category],
    }


@router.get('/inventory')
def inventory_analytics(db: Session = Depends(get_db), _=Depends(verify_token)):
    """Stock levels represent current state — no period filter applies."""
    products = db.query(Product).filter(Product.active == True).order_by(Product.stock_qty.asc()).all()
    total_active = len(products)
    out_of_stock = sum(1 for p in products if p.stock_qty <= 0)
    low_stock    = sum(1 for p in products if 0 < p.stock_qty <= 3)
    on_order     = sum(1 for p in products if p.stock_on_order > 0)
    return {
        'total_active': total_active,
        'out_of_stock': out_of_stock,
        'low_stock':    low_stock,
        'on_order':     on_order,
        'stock_levels': [
            {'name': p.name, 'stock_qty': p.stock_qty, 'stock_on_order': p.stock_on_order}
            for p in products[:15]
        ],
        'low_stock_items': [
            {'name': p.name, 'brand': p.brand, 'stock_qty': p.stock_qty, 'stock_on_order': p.stock_on_order}
            for p in products if p.stock_qty <= 3
        ],
    }
