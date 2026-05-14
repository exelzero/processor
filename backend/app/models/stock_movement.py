from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.database import Base

MOVEMENT_TYPES = [
    "sale",           # sold at POS — decrements stock_qty
    "return",         # customer return — increments stock_qty
    "order_placed",   # units ordered from supplier — increments stock_on_order
    "order_received", # delivery arrived — moves stock_on_order → stock_qty
    "adjustment",     # manual correction (shrinkage, damage, count fix)
]


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id             = Column(Integer, primary_key=True, index=True)
    product_id     = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    movement_type  = Column(Enum(*MOVEMENT_TYPES, name="movement_type_enum"), nullable=False, index=True)
    # Positive = stock in, negative = stock out.  Both qty fields use this convention.
    qty_delta      = Column(Integer, nullable=False)          # change to stock_qty
    on_order_delta = Column(Integer, nullable=False, default=0)  # change to stock_on_order
    reference_id   = Column(Integer, nullable=True)           # sale_id, etc.
    notes          = Column(String, nullable=True)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    product = relationship("Product")
