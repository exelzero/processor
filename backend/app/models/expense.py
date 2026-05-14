from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Numeric, Date, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

EXPENSE_CATEGORIES = [
    "Rent",
    "Utilities",
    "Products & Supplies",
    "Equipment",
    "Marketing",
    "Insurance",
    "Software & Subscriptions",
    "Cleaning",
    "Miscellaneous",
]


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    category: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    expense_date: Mapped[date] = mapped_column(Date, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
