from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Sale(Base):
    __tablename__ = 'sales'

    id              = Column(Integer, primary_key=True, index=True)
    patient_id      = Column(Integer, ForeignKey('patients.id'), nullable=False)
    promotion_id    = Column(Integer, ForeignKey('promotions.id'), nullable=True)
    sale_date       = Column(DateTime, nullable=False)
    subtotal        = Column(Float, nullable=False)
    discount_amount = Column(Float, default=0.0)
    total           = Column(Float, nullable=False)
    status          = Column(String, default='completed')  # completed | refunded | partially_refunded
    notes           = Column(String)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    patient   = relationship('Patient')
    promotion = relationship('Promotion')
    items     = relationship('SaleItem', back_populates='sale', cascade='all, delete-orphan')
    returns   = relationship('SaleReturn', back_populates='sale', cascade='all, delete-orphan')


class SaleItem(Base):
    __tablename__ = 'sale_items'

    id         = Column(Integer, primary_key=True, index=True)
    sale_id    = Column(Integer, ForeignKey('sales.id'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    quantity   = Column(Integer, default=1, nullable=False)
    unit_price = Column(Float, nullable=False)  # price at time of sale
    total      = Column(Float, nullable=False)

    sale    = relationship('Sale', back_populates='items')
    product = relationship('Product')


class SaleReturn(Base):
    __tablename__ = 'sale_returns'

    id          = Column(Integer, primary_key=True, index=True)
    sale_id     = Column(Integer, ForeignKey('sales.id'), nullable=False)
    return_date = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    amount      = Column(Float, nullable=False)
    reason      = Column(String)
    notes       = Column(String)

    sale = relationship('Sale', back_populates='returns')
