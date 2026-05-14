# Processor

Business management portal for OK Beauty Space.

Handles patient intake, appointments, services, and business metrics — runs fully locally.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + Tailwind |
| Backend | FastAPI + SQLAlchemy |
| Database | SQLite (local) |
| Auth | JWT (admin/password) |

## Structure

```
processor/
├── backend/         FastAPI app
│   ├── app/
│   │   ├── models/  SQLAlchemy models
│   │   ├── routes/  API endpoints
│   │   └── schemas/ Pydantic schemas
│   └── tests/
├── frontend/        React + Vite app
│   └── src/
│       ├── components/
│       ├── pages/
│       └── hooks/
└── scripts/         Seed + utility scripts
```

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Default login: `admin` / `password`
