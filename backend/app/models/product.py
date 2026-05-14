from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from app.database import Base


class Product(Base):
    __tablename__ = 'products'

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False)
    brand       = Column(String, nullable=False)
    description = Column(String)
    category    = Column(String, nullable=False)
    price       = Column(Float, nullable=False)
    cost        = Column(Float)
    sku         = Column(String, unique=True, nullable=False)
    active      = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
