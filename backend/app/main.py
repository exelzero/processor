from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.models import patient, service, appointment  # noqa: F401 — registers models
from app.routes import auth, patients, services, appointments, metrics

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Processor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(patients.router, prefix="/api/patients", tags=["patients"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(appointments.router, prefix="/api/appointments", tags=["appointments"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
