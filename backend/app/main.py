"""
FastAPI concurrency model — sync vs async route handlers.

Every route in this application is defined with `def` (synchronous), not
`async def`.  FastAPI handles these differently at the ASGI layer:

  async def handler():  runs directly on the event loop thread.
                        Must never block (no sync I/O, no time.sleep).
                        Other requests are served while it awaits.

  def handler():        FastAPI wraps it with anyio.to_thread.run_sync,
                        running it in a worker thread from a thread pool.
                        The event loop is free to serve other requests while
                        the thread is blocked on I/O (DB queries, etc.).

Why `def` here:
  SQLAlchemy's sync Session performs blocking I/O.  Using `async def` with
  a sync Session would block the event loop on every DB call, serialising
  all requests.  Running sync handlers in the thread pool lets multiple
  requests execute their DB work concurrently across threads.

Upgrade path:
  Switch to SQLAlchemy async Session (`AsyncSession`) + `async def` handlers
  for true async I/O (no thread-per-request overhead, higher concurrency).
  The trade-off is added complexity: async sessions, `await` at every DB call,
  and careful avoidance of sync code on the event loop.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.limiter import limiter

from app.database import engine, Base
from app.models import patient, service, appointment, product, promotion, sale  # noqa: F401 — registers models
from app.routes import auth, patients, services, appointments, metrics, analytics, products, promotions, sales, public

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Processor API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(promotions.router, prefix="/api/promotions", tags=["promotions"])
app.include_router(sales.router, prefix="/api/sales", tags=["sales"])
app.include_router(public.router, prefix="/api/public", tags=["public"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
