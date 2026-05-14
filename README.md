# Processor

Business management portal for **OK Beauty Space** — patients, appointments, services, product sales, expenses, and analytics, all in one place. Runs fully locally.

---

## Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend  | FastAPI + SQLAlchemy (sync)   |
| Database | SQLite (local file)           |
| Auth     | JWT — `admin` / `password`    |

---

## Quick Start

You need two terminals — one for the backend, one for the frontend.

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Log in with `admin` / `password`.

---

## Project Layout

```
processor/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, route registration
│   │   ├── auth.py          # JWT issue + verify
│   │   ├── database.py      # SQLAlchemy engine + session
│   │   ├── models/          # ORM models (one file per entity)
│   │   ├── routes/          # API endpoints (one file per domain)
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   └── utils/           # Shared helpers
│   └── tests/
│
├── frontend/
│   └── src/
│       ├── pages/           # Full-page views (one file per page)
│       ├── components/      # Shared UI components
│       ├── hooks/           # Data-fetching hooks (one per domain)
│       ├── api.js           # Axios instance with auth header
│       └── utils/format.js  # Currency, date, time formatters
│
└── scripts/                 # Seed data + one-off utilities
```

---

## Pages

| Page         | What it does |
|--------------|-------------|
| Dashboard    | KPI snapshot — revenue vs expenses chart, products on order, upcoming appointments |
| Patients     | Patient list, intake forms, document uploads |
| Appointments | Schedule, calendar view, status management |
| Services     | Service catalogue with pricing |
| Sales        | Product sales, POS-style transaction entry, refunds, inventory |
| Expenses     | Expense log by category |
| Analytics    | Full business analytics with period selector (YTD / 30 / 60 / 90 / 120 days) |

---

## API Routes

All routes are prefixed with `/api`.

| Prefix              | Domain |
|---------------------|--------|
| `/auth`             | Login, token |
| `/patients`         | Patient CRUD + document uploads |
| `/services`         | Service catalogue |
| `/appointments`     | Appointment scheduling + status |
| `/products`         | Product catalogue + stock management |
| `/sales`            | Sales transactions + refunds |
| `/expenses`         | Expense tracking |
| `/metrics`          | Dashboard aggregates |
| `/analytics`        | Deep analytics (period-aware) |
| `/public`           | Unauthenticated booking form |
| `/health`           | Health check |

Interactive docs at `http://localhost:8000/docs`.

---

## Environment

The backend loads `backend/.env` on startup. Needed for S3 document storage (optional — app works without it):

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=
```
