from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, ForeignKey, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

# TYPE_CHECKING is False at runtime and True only when a static analyser (mypy,
# Pyright) inspects the file.  Imports inside this block are never executed by
# the Python interpreter, which breaks circular import chains that would
# otherwise exist at module load time (Patient ↔ Appointment ↔ Service).
# The string-quoted annotations below ("Patient", "Service") are forward
# references — evaluated lazily — so type checkers can resolve them even
# though the classes are not imported at runtime.
if TYPE_CHECKING:
    from app.models.patient import Patient
    from app.models.service import Service


class Appointment(Base):
    __tablename__ = "appointments"

    # Mapped[T] is SQLAlchemy 2.0's typed column descriptor.  The Python type
    # parameter T is read by the ORM (to infer nullability) and by type checkers
    # (for static analysis of column access).  Mapped[int] → non-nullable int;
    # Mapped[Optional[str]] → nullable string.  This replaces the older untyped
    # Column(Integer) pattern and lets mypy catch mismatches between Python code
    # and the DB schema at analysis time rather than at runtime.
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Forward-reference strings resolve via the TYPE_CHECKING import without
    # triggering a runtime circular import.
    #
    # relationship() default loading strategy is "select" (lazy): the first time
    # code accesses appt.patient, SQLAlchemy issues a separate SELECT to load it.
    # With n appointments this causes N+1 queries.  Routes that enumerate many
    # appointments should override this at query time with joinedload():
    #
    #   db.query(Appointment).options(joinedload(Appointment.patient))
    #
    # That rewrites the query to a single LEFT OUTER JOIN, loading all patients
    # in one round-trip regardless of n.  Lazy loading is still the right default
    # here — some routes (get-by-id, status patch) access only one row and do not
    # need the joined data at all.
    patient: Mapped["Patient"] = relationship("Patient")
    service: Mapped["Service"] = relationship("Service")
