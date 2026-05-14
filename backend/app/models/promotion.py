from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from app.database import Base


class Promotion(Base):
    __tablename__ = 'promotions'

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False)
    code           = Column(String, unique=True, nullable=False)
    discount_type  = Column(String, nullable=False)   # 'percentage' | 'fixed'
    discount_value = Column(Float, nullable=False)
    min_purchase   = Column(Float)                    # minimum subtotal to qualify
    start_date     = Column(DateTime, nullable=False)
    end_date       = Column(DateTime, nullable=False)
    active         = Column(Boolean, default=True)
    max_uses       = Column(Integer)                  # null = unlimited
    uses_count     = Column(Integer, default=0)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
