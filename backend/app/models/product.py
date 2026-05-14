from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, CheckConstraint
from app.database import Base


class Product(Base):
    __tablename__ = 'products'

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String, nullable=False)
    brand            = Column(String, nullable=False)
    description      = Column(String)
    category         = Column(String, nullable=False)
    price            = Column(Float, nullable=False)
    cost             = Column(Float)
    sku              = Column(String, unique=True, nullable=False)
    active           = Column(Boolean, default=True)
    stock_qty        = Column(Integer, default=0, nullable=False)   # on shelf, ready to sell
    stock_on_order   = Column(Integer, default=0, nullable=False)   # paid for, awaiting delivery
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("stock_qty >= 0",      name="ck_product_stock_qty_nonneg"),
        CheckConstraint("stock_on_order >= 0", name="ck_product_stock_on_order_nonneg"),
    )
