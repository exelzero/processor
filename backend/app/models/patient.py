from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Date, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(20))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    skin_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    allergies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
