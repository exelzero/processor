# Processor — Project Overview

Processor is a full-stack business management portal built for **OK Beauty Space**, a medical aesthetics studio. It handles everything the business runs on: client records, appointment scheduling, product sales, inventory, expenses, and analytics — all in one place, running fully locally with no external subscriptions or cloud dependencies.

This document walks through what was built, the technical decisions behind it, and how everything fits together. Links go directly to the relevant files.

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Tech Stack](#2-tech-stack)
3. [Data Model](#3-data-model)
4. [Backend](#4-backend)
5. [Frontend](#5-frontend)
6. [Interesting Engineering Decisions](#6-interesting-engineering-decisions)
7. [Analytics & Metrics](#7-analytics--metrics)
8. [Authentication & Security](#8-authentication--security)
9. [Document Storage](#9-document-storage)
10. [Running It Locally](#10-running-it-locally)

---

## 1. What It Does

Before this existed, the business was running on a mix of calendar apps, paper forms, and end-of-month spreadsheets. There was no unified view of revenue, no way to track which products were running low, and no insight into whether the business was profitable.

Processor replaces all of that:

| Module | What it solves |
|---|---|
| **Patients** | Digital client profiles with skin type, allergies, clinical notes, and uploaded documents — no more paper intake forms |
| **Appointments** | Full scheduling with a calendar view, status tracking, and a public self-booking page with real availability |
| **Services** | A live service catalogue that drives both the booking system and all revenue analytics |
| **Product Sales** | A POS-style transaction flow with promo code support, inventory adjustment, and refund tracking |
| **Inventory** | Dual stock tracking (units on shelf vs. units on order) with a full audit trail of every change |
| **Expenses** | Categorised cost tracking so the P&L is always accurate |
| **Analytics** | A period-selectable analytics suite covering revenue, expenses, net profit, appointments, products, clients, and inventory |

---

## 2. Tech Stack

### Backend

| Layer | Choice | Why |
|---|---|---|
| Framework | **FastAPI** | Auto-generated OpenAPI docs; `Depends()` injection makes auth and DB wiring clean; async-capable for future scaling |
| ORM | **SQLAlchemy 2.0** | Typed `Mapped[T]` columns give mypy-level correctness; query builder avoids raw SQL; easy path to PostgreSQL if needed |
| Database | **SQLite** | Zero-config, no server to run — perfect for a single-location studio running on one machine |
| Validation | **Pydantic v2** | Field-level constraints catch bad input before it touches the DB; schemas are the single source of truth for request/response shape |
| Auth | **python-jose** | HS256 JWT — simple, stateless 8-hour sessions |
| Storage | **Boto3** | S3-compatible uploads work with MinIO locally, Cloudflare R2, or AWS S3 — same code, different config |
| Rate limiting | **SlowAPI** | Protects the public booking form from abuse without needing a reverse proxy |

### Frontend

| Layer | Choice | Why |
|---|---|---|
| UI | **React 19 + Vite** | Fast dev loop with HMR; small production bundles |
| Routing | **React Router 7** | SPA navigation; `PrivateRoute` wrapper handles auth guards cleanly |
| HTTP | **Axios** | Interceptors auto-attach the JWT and redirect to `/login` on `401` — no per-request auth boilerplate |
| Charts | **Recharts** | Composable primitives; easy to build multi-axis charts and combined bar/line charts |
| Calendar | **React Big Calendar** | Full calendar grid for the appointments view |
| Styling | **Tailwind CSS 4** | Utility-first — no separate CSS files; consistent design tokens |

---

## 3. Data Model

All models live in [`backend/app/models/`](./backend/app/models/). Here's the shape of the data and the reasoning behind key design choices.

### Entity Map

```
Patient ──< Appointment >── Service
   │
   ├──< Sale >── SaleItem >── Product
   │              │                └── StockMovement (audit log)
   │              └──< SaleReturn
   │
   ├──< PatientDocument  (S3-backed)
   │
   └── (referenced by Promotion via Sale.promotion_id)
```

---

### [`Patient`](./backend/app/models/patient.py)

The central record. Phone numbers are stored as digits only — `(555) 123-4567`, `5551234567`, and `+15551234567` all normalise to `5551234567`. This matters on the public booking form: a returning client who types their number in a different format still gets matched to their existing record.

Email has a unique constraint. On the public booking form, if a new patient's email already exists, the error message is intentionally vague ("Please check your details") to prevent email enumeration.

---

### [`Appointment`](./backend/app/models/appointment.py)

Links a patient to a service at a timestamp. `scheduled_at` is indexed because the availability engine runs date-range queries against it constantly. `status` flows through `scheduled → completed / cancelled / no-show` and drives every appointment metric.

---

### [`Product`](./backend/app/models/product.py)

Two stock fields, both with `CHECK(>= 0)` constraints enforced at the database level:

- `stock_qty` — units physically on the shelf, available to sell right now
- `stock_on_order` — units paid for but not yet delivered

Splitting these is intentional. They answer two different questions: *Can I sell this today?* vs *Do I need to re-order?* The Dashboard "Products on Order" panel shows `stock_on_order > 0` items so the owner knows what's coming without having to look it up.

---

### [`StockMovement`](./backend/app/models/stock_movement.py)

An **append-only audit log** of every inventory change.

```
movement_type:  sale | return | order_placed | order_received | adjustment
qty_delta:      signed int (negative for sales, positive for receipts)
on_order_delta: signed int (positive when ordered, negative when received)
reference_id:   links back to the sale or order that caused the change
```

Nothing is ever updated or deleted here. If you want to know why a product has 3 units on shelf, sum all `qty_delta` values for that product — it will equal `stock_qty`. This gives a full, traceable history of every inventory change.

---

### [`Sale`](./backend/app/models/sale.py) + [`SaleItem`](./backend/app/models/sale.py)

`SaleItem.unit_price` snapshots the product's price **at the time of sale** rather than pointing to the current price. This means historical revenue figures stay correct after a price change. Standard e-commerce practice — without it, changing a price retroactively rewrites history.

`SaleReturn` records refunds with a reason and amount. Stock restoration is a separate manual adjustment, because not all returned items go back to shelf.

---

### [`Expense`](./backend/app/models/expense.py)

`amount` uses `Numeric(10, 2)` — precise decimal arithmetic, never floating point. Financial values stored as floats accumulate rounding errors.

Categories are constrained to a fixed list enforced at two levels: the Pydantic schema (rejects invalid input before it hits the DB) and a `CheckConstraint` in the SQLAlchemy model (database-level enforcement). Both levels are needed — the Pydantic check protects the API, the DB constraint protects against direct writes.

---

### [`Promotion`](./backend/app/models/promotion.py)

Promo codes with full validity logic: date window, minimum purchase, optional usage cap. `uses_count` is incremented atomically on each valid redemption.

---

### [`PatientDocument`](./backend/app/models/document.py)

The actual file lives in S3. This table stores the pointer and metadata (`s3_key`, `filename`, `content_type`, `size_bytes`). Downloads are presigned URLs — the browser fetches directly from S3 so large files never pass through the API server.

---

## 4. Backend

Routes live in [`backend/app/routes/`](./backend/app/routes/). All wired up in [`main.py`](./backend/app/main.py) under `/api`.

---

### Public Booking — [`public.py`](./backend/app/routes/public.py)

This is the most technically interesting route file. It powers the self-booking page that patients use without logging in.

**Business rules enforced:**
- At least **1 hour** notice before a booking
- Maximum **60 days** ahead
- Business hours **9 AM – 7 PM**
- Slots on **30-minute boundaries**
- **10-minute buffer** added after each appointment before the next slot opens

**Availability — built for correctness and performance:**

`GET /available-dates` needs to return which days in a month have open slots. The naive approach — one DB query per day — would fire up to 31 queries. Instead, a single query fetches all appointments in the month, which are then grouped by date in Python. One round-trip covers the whole month.

`GET /availability` returns open time slots for a specific day. Busy intervals are computed once and cached in an LRU cache (capacity 14, covering two weeks). Cache hit is O(1) — no DB round-trip. The slot-finder itself uses **binary search** (`bisect`) over sorted, merged busy intervals instead of a linear scan: O((n+s) log n) vs O(s×n). At single-practitioner scale the difference is small but the algorithm is correct regardless of scale.

**Preventing double-booking:**

`POST /book` re-validates slot availability at commit time using `SELECT ... FOR UPDATE`. Without this, two clients could both pass the availability check and both proceed to create overlapping appointments (time-of-check / time-of-use race). The row lock ensures the second request re-reads committed data before inserting.

After every successful booking, the LRU cache entry for that date is **invalidated before the response is returned**, so the next availability check is always fresh.

Rate limited to **10 bookings/hour** and **60 availability checks/minute** per IP.

---

### Sales & Inventory — [`sales.py`](./backend/app/routes/sales.py) + [`products.py`](./backend/app/routes/products.py)

Every sale:
1. Validates the promo code if provided (active, within dates, min purchase met, usage cap not hit)
2. Snapshots `unit_price` from the current product price
3. Creates `StockMovement(type="sale", qty_delta=-qty)` for each line item
4. Increments `promotion.uses_count` if a code was used

Every stock operation (order, receive, adjust) creates a `StockMovement` row. The product's `stock_qty` and `stock_on_order` are the live totals; the movements table is the history.

---

### Patients — [`patients.py`](./backend/app/routes/patients.py)

Straightforward CRUD. Phones are normalised on write (digits only), which is also how matching works on the booking form.

---

### Appointments — [`appointments.py`](./backend/app/routes/appointments.py)

Uses `joinedload(Appointment.patient)` and `joinedload(Appointment.service)` to avoid N+1 queries — one JOIN loads all related data for a list of appointments. An `_enrich()` helper flattens the joined objects into a clean response dict.

Every write invalidates the availability cache for the affected date, keeping the public booking page in sync.

---

### Analytics — [`analytics.py`](./backend/app/routes/analytics.py)

All endpoints accept `?period=` (`ytd`, `30d`, `60d`, `90d`, `120d`). A central `_start_dt(period)` helper converts the string to a `datetime` lower bound used as a filter. Unknown periods return **422** — no silent fallback to all-time.

See [Section 7](#7-analytics--metrics) for full detail.

---

### Metrics — [`metrics.py`](./backend/app/routes/metrics.py)

Dashboard aggregates — YTD snapshots for KPIs, monthly revenue vs expenses, and the on-order product list. Uses `func.substr(cast(field, String), 1, 7)` for portable ANSI SQL month extraction (works on SQLite, PostgreSQL, and MySQL — unlike `strftime` which is SQLite-only).

---

## 5. Frontend

### Data Flow

Every page delegates all API communication to a custom hook. Pages never call `api.get()` directly — they consume state and handlers from a hook and focus on layout and interaction.

```
Page  →  custom hook  →  api.js (Axios + JWT)  →  FastAPI
```

This keeps pages clean and the data layer independently testable.

---

### [`api.js`](./frontend/src/api.js)

Two Axios interceptors handle auth for the entire app:

- **Request:** reads token from `localStorage`, attaches `Authorization: Bearer {token}`
- **Response:** on `401`, clears token and redirects to `/login` — expired sessions are handled automatically, no per-page logic needed

---

### [`useAnalytics`](./frontend/src/hooks/useAnalytics.js)

Fires 9 requests in parallel with `Promise.all`. When the period selector changes, a new `AbortController` is created and passed to every request. If the period changes again before the first batch resolves, the in-flight requests are cancelled — no stale data overwrites the fresh response.

```js
useEffect(() => {
  const controller = new AbortController()
  // ... 9 parallel requests with { signal: controller.signal }
  return () => controller.abort()  // cancel on cleanup
}, [period])
```

---

### Pages

| Page | Hook | Description |
|---|---|---|
| [`Dashboard.jsx`](./frontend/src/pages/Dashboard.jsx) | [`useMetrics`](./frontend/src/hooks/useMetrics.js) | KPI strip, revenue vs expenses line chart, products on order, next 10 appointments |
| [`Analytics.jsx`](./frontend/src/pages/Analytics.jsx) | [`useAnalytics`](./frontend/src/hooks/useAnalytics.js) | Full analytics suite with YTD / 30 / 60 / 90 / 120-day period selector |
| [`Patients.jsx`](./frontend/src/pages/Patients.jsx) | [`usePatients`](./frontend/src/hooks/usePatients.js) | Client list, create/edit, document uploads |
| [`Appointments.jsx`](./frontend/src/pages/Appointments.jsx) | [`useAppointments`](./frontend/src/hooks/useAppointments.js) | List + full calendar view, status management |
| [`Services.jsx`](./frontend/src/pages/Services.jsx) | [`useServices`](./frontend/src/hooks/useServices.js) | Service catalogue management |
| [`Sales.jsx`](./frontend/src/pages/Sales.jsx) | [`useSales`](./frontend/src/hooks/useSales.js), [`useProducts`](./frontend/src/hooks/useProducts.js) | POS transaction entry, inventory panel, refund flow |
| [`Expenses.jsx`](./frontend/src/pages/Expenses.jsx) | [`useExpenses`](./frontend/src/hooks/useExpenses.js) | Expense log by category |
| [`Book.jsx`](./frontend/src/pages/Book.jsx) | — | Public self-booking wizard |

---

### Key Components

[`SlidePanel`](./frontend/src/components/SlidePanel.jsx) is the standard pattern for create/edit forms throughout the app — a slide-in drawer opened by setting a state object and closed by setting it to `null`. One hard-learned rule: JSX evaluates all props even when a panel is closed, so `title={panel.product.name}` crashes when `panel` is `null`. The correct pattern is `title={panel?.product?.name ?? ''}`.

[`AppointmentCalendar`](./frontend/src/components/AppointmentCalendar.jsx) wraps React Big Calendar with custom event rendering and a daily/weekly/monthly view toggle.

[`format.js`](./frontend/src/utils/format.js) — four formatters (`formatCurrency`, `formatDate`, `formatTime`, `toDatetimeLocal`) used throughout the UI. `toDatetimeLocal` handles the DST trap by formatting directly from the ISO string rather than adjusting by `getTimezoneOffset()`, which would silently shift times by the local UTC offset.

---

## 6. Interesting Engineering Decisions

### Binary Search Scheduling

The slot-finder in [`public.py`](./backend/app/routes/public.py) uses `bisect.bisect_right` on sorted, merged busy intervals. For each candidate slot, only two positions in the sorted list can overlap it — the interval immediately before and the one immediately after the binary search pivot. This eliminates the need to scan every busy interval for every candidate. O((n+s) log n) overall, vs O(s×n) for the naive approach.

The intervals are merged first (sorted, sweep through overlapping pairs) so the two-pointer invariant holds. Without merging, two overlapping busy intervals could fool the binary search.

### LRU Cache with Invalidation

The availability engine caches busy intervals per date. The cache stores empty lists too (`[]` is a valid "fully free day" result worth caching). Invalidation happens immediately after a commit, before `db.refresh()` — this ordering ensures a transient error on refresh can't leave a stale cache entry pointing at a slot that no longer exists.

### Immutable Audit Trail

`StockMovement` is never updated or deleted. Every inventory change — sale, order, receipt, adjustment — appends a row with `qty_delta` and `on_order_delta`. The sum of all deltas for a product always equals the current stock value. This makes discrepancy investigation trivial and prevents anyone from quietly editing history.

### Abort-Controlled Analytics Fetches

Changing the period selector on the Analytics page fires 9 parallel requests. Without cleanup, a slow response from the previous period could arrive after the new period's responses and overwrite the correct data. The `AbortController` pattern in [`useAnalytics`](./frontend/src/hooks/useAnalytics.js) cancels all in-flight requests when the period changes, and `CanceledError` is silently ignored — only genuine failures are shown to the user.

### Price Snapshotting

`SaleItem.unit_price` stores the product price at transaction time, not a pointer to the current price. Updating a product's price does not retroactively change any historical revenue figures. Simple invariant, easy to get wrong.

### Email Enumeration Protection

On the public booking form, if a new patient submits an email that already exists in the system, the API returns a generic "Please check your details" error rather than "that email is already taken." This prevents an attacker from enumerating client email addresses through the unauthenticated booking endpoint.

### Portable SQL

Financial queries use `func.substr(cast(field, String), 1, 7)` to extract `YYYY-MM` from datetime fields — this is portable ANSI SQL that works on SQLite, PostgreSQL, and MySQL. Earlier versions used SQLite-only `strftime('%Y-%m', ...)`, which would have broken silently on a database migration.

---

## 7. Analytics & Metrics

### Dashboard — [`metrics.py`](./backend/app/routes/metrics.py)

Always shows current-state and YTD data. No period selector.

| Endpoint | Returns |
|---|---|
| `/summary` | Total patients, appointments, combined revenue (services + products), total expenses |
| `/revenue-by-month` | Monthly revenue and expenses — YTD, current calendar year |
| `/on-order` | Products awaiting delivery (`stock_on_order > 0`) — up to 50 |
| `/upcoming` | Next 10 scheduled appointments |

### Analytics Page — [`analytics.py`](./backend/app/routes/analytics.py)

Every endpoint accepts `?period=ytd|30d|60d|90d|120d`. Passing an invalid value returns `422`. The `_start_dt()` helper converts the period string to a `datetime` lower bound used in all queries.

| Section | Endpoints | What it shows |
|---|---|---|
| **Combined KPIs** | metrics from multiple endpoints | Total Revenue (services + products), Total Expenses, Net profit/loss (green/red), Total Volume |
| **Service Revenue** | `/revenue-trend`, `/category-mix` | Monthly revenue + appointment volume chart, revenue by service category donut |
| **Appointments** | `/status-trend`, `/schedule-patterns` | Status by month stacked bar, busiest day of week, busiest hour of day |
| **Services** | `/service-performance`, `/service-utilization` | Top services by revenue and by bookings count |
| **Clients** | `/client-insights` | New client acquisition, retention (returning vs first-time), skin type distribution, top 10 clients by revenue |
| **Product Sales** | `/product-sales` | Transactions, revenue, avg sale value; monthly trend; top products by revenue and by units sold |
| **Expenses** | `/expenses` | Total, monthly average, largest category; monthly bar chart; category breakdown donut |
| **Inventory** | `/inventory` | Active products, out-of-stock count, low-stock count, on-order count; stock levels chart; stock alerts list |

The period selector in the top-right fires all 9 requests in parallel when changed. Stale in-flight requests are cancelled via `AbortController`.

---

## 8. Authentication & Security

Auth lives in [`backend/app/auth.py`](./backend/app/auth.py).

- **Mechanism:** HS256 JWT, 8-hour lifetime
- **Single admin account:** username `admin`, password `password`
- **Token storage:** `localStorage` on the client
- **Session expiry:** the Axios response interceptor clears the token and redirects to `/login` on any `401`

> ⚠️ **Before any non-local deployment:**
> - Replace `SECRET_KEY` in `auth.py` with a randomly generated secret (32+ characters)
> - Change `ADMIN_PASSWORD` to something strong
> - Move both to environment variables — never commit secrets to version control

The public booking routes (`/api/public/*`) are unauthenticated but rate-limited via [SlowAPI](./backend/app/limiter.py): 10 bookings/hour and 60 availability checks/minute per IP address.

---

## 9. Document Storage

Configured in [`backend/app/s3.py`](./backend/app/s3.py). Supports three backends — same code, different environment variables:

| Backend | `S3_ENDPOINT_URL` |
|---|---|
| **MinIO** (local dev) | `http://localhost:9000` |
| **Cloudflare R2** | `https://<account>.r2.cloudflarestorage.com` |
| **AWS S3** | leave unset |

`ensure_bucket()` runs at startup — creates the bucket if it doesn't exist, silently skips if it already does. If S3 is unreachable, the app logs a warning and continues; document uploads fail gracefully but everything else works.

**Upload:** file streams to S3 at `patients/{patient_id}/{uuid}_{filename}`. Metadata saved to DB. Response includes a 1-hour presigned URL for immediate preview.

**Download:** generates a fresh presigned URL on demand. The browser fetches directly from S3 — large files never pass through the API server.

Set in `backend/.env`:
```
S3_ENDPOINT_URL=
S3_BUCKET=processor-docs
S3_REGION=us-east-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

---

## 10. Running It Locally

Two terminals.

**Terminal 1 — Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# API at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
# App at http://localhost:5173
```

Login: `admin` / `password`

**Seed the database** (recommended — gives all analytics charts real data):
```bash
python scripts/seed.py          # safe to run once after first startup
python scripts/seed.py --force  # wipe and re-seed
```

[`seed.py`](./scripts/seed.py) creates 10 services, 500 patients, 32 products, 10 promotions, months of appointment and sales history, expenses, and stock movements — everything needed to see the full system in action.
