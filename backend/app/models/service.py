from typing import Optional
from sqlalchemy import String, Float, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    price: Mapped[float] = mapped_column(Float)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
