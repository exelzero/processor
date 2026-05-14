from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.auth import verify_token
from app.models.sale import Sale, SaleItem, SaleReturn
from app.models.product import Product
from app.models.promotion import Promotion

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SaleItemIn(BaseModel):
    product_id: int
    quantity: int = 1


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
    q = db.query(Sale)
    if status:
        q = q.filter(Sale.status == status)
    if start:
        q = q.filter(Sale.sale_date >= datetime.fromisoformat(start))
    if end:
        q = q.filter(Sale.sale_date <= datetime.fromisoformat(end + 'T23:59:59'))
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
        if promo.min_purchase and subtotal < promo.min_purchase:
            raise HTTPException(status_code=400, detail=f'Minimum purchase ${promo.min_purchase:.2f} required')
        if promo.max_uses and promo.uses_count >= promo.max_uses:
            raise HTTPException(status_code=400, detail='Promo code has reached its limit')
        discount = round(subtotal * promo.discount_value / 100, 2) if promo.discount_type == 'percentage' else min(promo.discount_value, subtotal)
        promotion_id = promo.id
        promo.uses_count += 1

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
    db.commit()
    db.refresh(sale)
    return _enrich(sale)


@router.get('/{sale_id}')
def get_sale(sale_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail='Sale not found')
    return _enrich(sale)


@router.post('/{sale_id}/return', status_code=201)
def create_return(sale_id: int, data: ReturnIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail='Sale not found')
    if sale.status == 'refunded':
        raise HTTPException(status_code=400, detail='Sale is already fully refunded')
    if data.amount <= 0 or data.amount > sale.total:
        raise HTTPException(status_code=400, detail=f'Return amount must be between $0.01 and ${sale.total:.2f}')

    ret = SaleReturn(
        sale_id=sale_id,
        return_date=datetime.utcnow(),
        amount=round(data.amount, 2),
        reason=data.reason,
        notes=data.notes,
    )
    db.add(ret)

    total_returned = sum(r.amount for r in sale.returns) + data.amount
    sale.status = 'refunded' if total_returned >= sale.total else 'partially_refunded'
    db.commit()
    db.refresh(sale)
    return _enrich(sale)
