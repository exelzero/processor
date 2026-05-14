from typing import List, Optional
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload, selectinload
from pydantic import BaseModel, field_validator

from app.database import get_db
from app.auth import verify_token
from app.models.sale import Sale, SaleItem, SaleReturn
from app.models.product import Product
from app.models.promotion import Promotion
from app.models.stock_movement import StockMovement

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SaleItemIn(BaseModel):
    product_id: int
    quantity: int = 1

    @field_validator('quantity')
    @classmethod
    def quantity_positive(cls, v):
        if v < 1:
            raise ValueError('Quantity must be at least 1')
        return v


class SaleIn(BaseModel):
    patient_id: int
    sale_date: datetime
    items: List[SaleItemIn]
    promo_code: Optional[str] = None
    notes: Optional[str] = None


class SaleItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_brand: str
    quantity: int
    unit_price: float
    total: float
    model_config = {'from_attributes': True}


class ReturnOut(BaseModel):
    id: int
    return_date: datetime
    amount: float
    reason: Optional[str]
    notes: Optional[str]
    model_config = {'from_attributes': True}


class SaleOut(BaseModel):
    id: int
    patient_id: int
    patient_name: str
    promotion_id: Optional[int]
    promo_code: Optional[str]
    sale_date: datetime
    subtotal: float
    discount_amount: float
    total: float
    status: str
    notes: Optional[str]
    items: List[SaleItemOut]
    returns: List[ReturnOut]
    created_at: datetime


class ReturnIn(BaseModel):
    amount: float
    reason: Optional[str] = None
    notes: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_sale(db: Session, sale_id: int) -> Sale:
    """
    Fetch a sale with all relationships eagerly loaded.

    Without eager loading, accessing sale.patient, sale.promotion, or iterating
    sale.items inside _enrich() would trigger one extra SELECT per relationship
    per call — O(r) additional queries where r = number of relationships.
    Across a list of n sales that becomes O(r × n) round trips (the N+1 problem).

    joinedload uses a SQL JOIN — all data arrives in one query, O(1) round trips.
    selectinload uses a follow-up IN (...) query per collection, also O(1) round
    trips, but avoids the row-multiplication that a JOIN produces for to-many
    relationships (e.g. a sale with 5 items would repeat the sale columns 5 times
    in a JOIN result).
    """
    sale = (
        db.query(Sale)
        .options(
            joinedload(Sale.patient),
            joinedload(Sale.promotion),
            selectinload(Sale.items).joinedload(SaleItem.product),
            selectinload(Sale.returns),
        )
        .filter(Sale.id == sale_id)
        .first()
    )
    return sale


def _enrich(sale: Sale) -> dict:
    return {
        'id':              sale.id,
        'patient_id':      sale.patient_id,
        'patient_name':    f'{sale.patient.first_name} {sale.patient.last_name}',
        'promotion_id':    sale.promotion_id,
        'promo_code':      sale.promotion.code if sale.promotion else None,
        'sale_date':       sale.sale_date,
        'subtotal':        sale.subtotal,
        'discount_amount': sale.discount_amount,
        'total':           sale.total,
        'status':          sale.status,
        'notes':           sale.notes,
        'items': [
            {
                'id':            item.id,
                'product_id':    item.product_id,
                'product_name':  item.product.name,
                'product_brand': item.product.brand,
                'quantity':      item.quantity,
                'unit_price':    item.unit_price,
                'total':         item.total,
            }
            for item in sale.items
        ],
        'returns': [
            {
                'id':          r.id,
                'return_date': r.return_date,
                'amount':      r.amount,
                'reason':      r.reason,
                'notes':       r.notes,
            }
            for r in sale.returns
        ],
        'created_at': sale.created_at,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get('/')
def list_sales(
    status: Optional[str] = Query(None),
    start:  Optional[str] = Query(None),
    end:    Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    q = (
        db.query(Sale)
        .options(
            joinedload(Sale.patient),
            joinedload(Sale.promotion),
            selectinload(Sale.items).joinedload(SaleItem.product),
            selectinload(Sale.returns),
        )
    )
    if status:
        q = q.filter(Sale.status == status)
    if start:
        try:
            q = q.filter(Sale.sale_date >= datetime.combine(date.fromisoformat(start), datetime.min.time()))
        except ValueError:
            raise HTTPException(status_code=400, detail='Invalid start date format (expected YYYY-MM-DD)')
    if end:
        try:
            q = q.filter(Sale.sale_date <= datetime.combine(date.fromisoformat(end), datetime.max.time()))
        except ValueError:
            raise HTTPException(status_code=400, detail='Invalid end date format (expected YYYY-MM-DD)')
    sales = q.order_by(Sale.sale_date.desc()).all()
    return [_enrich(s) for s in sales]


@router.post('/', status_code=201)
def create_sale(data: SaleIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    if not data.items:
        raise HTTPException(status_code=400, detail='Sale must include at least one item')

    # Build line items and compute subtotal
    sale_items = []
    subtotal = 0.0
    for item_in in data.items:
        product = db.get(Product, item_in.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f'Product {item_in.product_id} not found')
        if not product.active:
            raise HTTPException(status_code=400, detail=f'Product "{product.name}" is no longer available')
        line_total = round(product.price * item_in.quantity, 2)
        subtotal += line_total
        sale_items.append(SaleItem(
            product_id=item_in.product_id,
            quantity=item_in.quantity,
            unit_price=product.price,
            total=line_total,
        ))
    subtotal = round(subtotal, 2)

    # Validate and apply promo code
    discount = 0.0
    promotion_id = None
    if data.promo_code:
        promo = db.query(Promotion).filter(Promotion.code == data.promo_code.upper()).first()
        if not promo or not promo.active:
            raise HTTPException(status_code=400, detail='Invalid promo code')
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if now < promo.start_date or now > promo.end_date:
            raise HTTPException(status_code=400, detail='Promo code is not currently valid')
        if promo.min_purchase and subtotal < promo.min_purchase:
            raise HTTPException(status_code=400, detail=f'Minimum purchase ${promo.min_purchase:.2f} required')
        if promo.max_uses and promo.uses_count >= promo.max_uses:
            raise HTTPException(status_code=400, detail='Promo code has reached its limit')
        discount = round(subtotal * promo.discount_value / 100, 2) if promo.discount_type == 'percentage' else min(promo.discount_value, subtotal)
        promotion_id = promo.id
        # Atomic increment to avoid race condition under concurrent requests
        db.execute(
            text('UPDATE promotions SET uses_count = uses_count + 1 WHERE id = :id'),
            {'id': promo.id},
        )

    sale = Sale(
        patient_id=data.patient_id,
        promotion_id=promotion_id,
        sale_date=data.sale_date,
        subtotal=subtotal,
        discount_amount=round(discount, 2),
        total=round(subtotal - discount, 2),
        status='completed',
        notes=data.notes,
    )
    db.add(sale)
    db.flush()
    for item in sale_items:
        item.sale_id = sale.id
        db.add(item)
        # Deduct from on-shelf stock; allow negative (oversell) so the sale
        # isn't blocked — the UI shows a low-stock warning instead.
        product = db.get(Product, item.product_id)
        product.stock_qty -= item.quantity
        db.add(StockMovement(
            product_id=item.product_id,
            movement_type="sale",
            qty_delta=-item.quantity,
            on_order_delta=0,
            reference_id=sale.id,
        ))
    db.commit()

    sale = _load_sale(db, sale.id)
    return _enrich(sale)


@router.get('/{sale_id}')
def get_sale(sale_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    sale = _load_sale(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail='Sale not found')
    return _enrich(sale)


@router.post('/{sale_id}/return', status_code=201)
def create_return(sale_id: int, data: ReturnIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    sale = _load_sale(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail='Sale not found')
    if sale.status == 'refunded':
        raise HTTPException(status_code=400, detail='Sale is already fully refunded')

    already_returned = sum(r.amount for r in sale.returns)
    remaining = round(sale.total - already_returned, 2)
    if data.amount <= 0 or data.amount > remaining:
        raise HTTPException(status_code=400, detail=f'Return amount must be between $0.01 and ${remaining:.2f}')

    ret = SaleReturn(
        sale_id=sale_id,
        return_date=datetime.now(timezone.utc).replace(tzinfo=None),
        amount=round(data.amount, 2),
        reason=data.reason,
        notes=data.notes,
    )
    db.add(ret)

    total_returned = already_returned + data.amount
    is_full_refund = total_returned >= sale.total
    sale.status = 'refunded' if is_full_refund else 'partially_refunded'

    # On a full refund put all items back into stock.
    # Partial returns are financial-only — we don't know which units came back.
    if is_full_refund:
        for item in sale.items:
            product = db.get(Product, item.product_id)
            product.stock_qty += item.quantity
            db.add(StockMovement(
                product_id=item.product_id,
                movement_type="return",
                qty_delta=item.quantity,
                on_order_delta=0,
                reference_id=sale.id,
            ))
    db.commit()

    sale = _load_sale(db, sale_id)
    return _enrich(sale)
