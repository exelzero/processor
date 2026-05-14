from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Date, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Mapped[str] encodes NOT NULL in the type itself — no nullable=False needed.
    # Mapped[Optional[str]] (equivalent to Mapped[str | None] in Python 3.10+)
    # encodes NULL-allowed and forces a None-check before use in type-checked code.
    # The type annotation and the DB constraint live in the same declaration so
    # they cannot drift apart the way they could when Column(nullable=True) and
    # the Python Optional lived in separate places.
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    # unique=True creates a UNIQUE constraint and implicitly a B-tree index.
    # index=True is technically redundant here (the unique constraint already
    # gives the DB an index to enforce uniqueness), but it makes the intent
    # explicit in the model definition: this column is both constrained and
    # optimised for point lookups (WHERE email = ?).
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(20))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    skin_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    allergies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
