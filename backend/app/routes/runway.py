from collections import defaultdict
from datetime import date, datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import cast, func, String

from app.database import get_db
from app.auth import verify_token
from app.models.appointment import Appointment
from app.models.service import Service
from app.models.sale import Sale
from app.models.expense import Expense

router = APIRouter()

# Industry benchmarks for a beauty/aesthetics studio.
# Each factor is a multiplier applied to the base monthly net when projecting
# forward. Values above 1.0 are peak periods; below 1.0 are slow periods.
# When 12+ months of real history exist, derived seasonal indices from actual
# data override these benchmarks (see _blend_factors).
SEASONAL_BENCHMARKS = {
    1:  {"factor": 0.80, "note": "Post-holiday slowdown"},
    2:  {"factor": 1.10, "note": "Valentine's Day"},
    3:  {"factor": 0.95, "note": "Early spring"},
    4:  {"factor": 1.05, "note": "Spring + Easter"},
    5:  {"factor": 1.20, "note": "Mother's Day + prom season"},
    6:  {"factor": 1.10, "note": "Wedding season"},
    7:  {"factor": 1.00, "note": "Mid-summer"},
    8:  {"factor": 0.95, "note": "Late summer"},
    9:  {"factor": 1.00, "note": "Back to routine"},
    10: {"factor": 1.05, "note": "Fall events"},
    11: {"factor": 1.05, "note": "Holiday prep"},
    12: {"factor": 1.15, "note": "Holiday parties + gift cards"},
}

MONTH_LABELS = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr",
    5: "May", 6: "Jun", 7: "Jul", 8: "Aug",
    9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
}


def _blend_factors(historical: list[dict]) -> dict[int, float]:
    """
    Derive seasonal indices from real history when enough data exists,
    blending with industry benchmarks when data is sparse.

    Seasonal index for a month = that month's avg revenue /
    overall avg monthly revenue across all months.

    Blending weight: 100% derived once we have 12+ months of data;
    linearly interpolated between benchmark and derived for fewer months.
    This prevents a single unusual month from distorting the forecast when
    the dataset is small.
    """
    if not historical:
        return {m: v["factor"] for m, v in SEASONAL_BENCHMARKS.items()}

    monthly_revenue: dict[int, list[float]] = defaultdict(list)
    for row in historical:
        month_num = int(row["month"].split("-")[1])
        monthly_revenue[month_num].append(row["revenue"])

    if not monthly_revenue:
        return {m: v["factor"] for m, v in SEASONAL_BENCHMARKS.items()}

    # Overall average across all months present
    all_revenues = [v for vals in monthly_revenue.values() for v in vals]
    overall_avg = sum(all_revenues) / len(all_revenues) if all_revenues else 1.0

    n_months = len(historical)
    blend_weight = min(n_months / 12.0, 1.0)  # 0 → 1 as data grows to 12 months

    factors = {}
    for m in range(1, 13):
        benchmark = SEASONAL_BENCHMARKS[m]["factor"]
        if m in monthly_revenue and overall_avg > 0:
            derived = (sum(monthly_revenue[m]) / len(monthly_revenue[m])) / overall_avg
            factors[m] = round(benchmark * (1 - blend_weight) + derived * blend_weight, 4)
        else:
            factors[m] = benchmark

    return factors


@router.get("")
def runway(db: Session = Depends(get_db), _=Depends(verify_token)):
    # ── Revenue: service appointments ────────────────────────────────────────
    service_by_month = (
        db.query(
            func.substr(cast(Appointment.scheduled_at, String), 1, 7).label("month"),
            func.sum(Service.price).label("revenue"),
        )
        .join(Service, Appointment.service_id == Service.id)
        .filter(Appointment.status == "completed")
        .group_by(func.substr(cast(Appointment.scheduled_at, String), 1, 7))
        .all()
    )

    # ── Revenue: product sales ────────────────────────────────────────────────
    sales_by_month = (
        db.query(
            func.substr(cast(Sale.sale_date, String), 1, 7).label("month"),
            func.sum(Sale.total).label("revenue"),
        )
        .filter(Sale.status.in_(["completed", "partially_refunded"]))
        .group_by(func.substr(cast(Sale.sale_date, String), 1, 7))
        .all()
    )

    # ── Expenses ──────────────────────────────────────────────────────────────
    expenses_by_month = (
        db.query(
            func.substr(cast(Expense.expense_date, String), 1, 7).label("month"),
            func.sum(Expense.amount).label("expenses"),
        )
        .group_by(func.substr(cast(Expense.expense_date, String), 1, 7))
        .all()
    )

    # ── Merge into a single monthly picture ───────────────────────────────────
    by_month: dict[str, dict] = defaultdict(lambda: {"revenue": 0.0, "expenses": 0.0})
    for r in service_by_month:
        by_month[r.month]["revenue"] += float(r.revenue)
    for r in sales_by_month:
        by_month[r.month]["revenue"] += float(r.revenue)
    for r in expenses_by_month:
        by_month[r.month]["expenses"] += float(r.expenses)

    historical = [
        {
            "month": m,
            "revenue": round(d["revenue"], 2),
            "expenses": round(d["expenses"], 2),
            "net": round(d["revenue"] - d["expenses"], 2),
        }
        for m, d in sorted(by_month.items())
    ]

    # ── Derived cash balance (all-time) ───────────────────────────────────────
    total_revenue = sum(r["revenue"] for r in historical)
    total_expenses = sum(r["expenses"] for r in historical)
    current_cash = round(total_revenue - total_expenses, 2)

    # ── Averages ──────────────────────────────────────────────────────────────
    n = len(historical) or 1
    monthly_avg_revenue  = round(total_revenue / n, 2)
    monthly_avg_expenses = round(total_expenses / n, 2)
    monthly_avg_net      = round(monthly_avg_revenue - monthly_avg_expenses, 2)
    burn_rate            = monthly_avg_expenses

    is_profitable = monthly_avg_net >= 0
    months_of_runway = (
        None if is_profitable or burn_rate == 0 or current_cash <= 0
        else round(current_cash / burn_rate, 1)
    )

    # ── Seasonal factors (blended benchmark + derived) ────────────────────────
    blended = _blend_factors(historical)
    seasonal_factors = [
        {
            "month": m,
            "label": MONTH_LABELS[m],
            "factor": blended[m],
            "note": SEASONAL_BENCHMARKS[m]["note"],
        }
        for m in range(1, 13)
    ]

    # ── 12-month forward forecast ─────────────────────────────────────────────
    today = date.today()
    forecast = []
    running_cash = current_cash
    for i in range(1, 13):
        # Advance month
        raw_month = today.month + i
        year  = today.year + (raw_month - 1) // 12
        month = ((raw_month - 1) % 12) + 1

        factor = blended[month]
        proj_revenue  = round(monthly_avg_revenue  * factor, 2)
        proj_expenses = round(monthly_avg_expenses, 2)  # expenses don't vary seasonally
        proj_net      = round(proj_revenue - proj_expenses, 2)
        running_cash  = round(running_cash + proj_net, 2)

        forecast.append({
            "month":              f"{year}-{month:02d}",
            "label":              MONTH_LABELS[month],
            "factor":             factor,
            "seasonal_note":      SEASONAL_BENCHMARKS[month]["note"],
            "projected_revenue":  proj_revenue,
            "projected_expenses": proj_expenses,
            "projected_net":      proj_net,
            "cumulative_cash":    running_cash,
        })

    return {
        "current_cash":          current_cash,
        "monthly_avg_revenue":   monthly_avg_revenue,
        "monthly_avg_expenses":  monthly_avg_expenses,
        "monthly_avg_net":       monthly_avg_net,
        "burn_rate":             burn_rate,
        "months_of_runway":      months_of_runway,
        "is_profitable":         is_profitable,
        "seasonal_factors":      seasonal_factors,
        "forecast":              forecast,
        "historical_monthly":    historical,
    }
