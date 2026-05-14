from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.database import get_db
from app.auth import verify_token
from app.models.product import Product
from app.models.stock_movement import StockMovement

router = APIRouter()


class ProductIn(BaseModel):
    name: str
    brand: str
    description: Optional[str] = None
    category: str
    price: float
    cost: Optional[float] = None
    sku: str
    active: bool = True


class ProductOut(ProductIn):
    id: int
    stock_qty: int
    stock_on_order: int
    created_at: datetime
    model_config = {'from_attributes': True}


class StockMovementOut(BaseModel):
    id: int
    product_id: int
    movement_type: str
    qty_delta: int
    on_order_delta: int
    reference_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    model_config = {'from_attributes': True}


class OrderIn(BaseModel):
    quantity: int
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def qty_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("quantity must be at least 1")
        return v


class AdjustmentIn(BaseModel):
    delta: int   # positive = add, negative = remove (damage, shrinkage, count fix)
    notes: Optional[str] = None


@router.get('/', response_model=List[ProductOut])
def list_products(active_only: bool = False, db: Session = Depends(get_db), _=Depends(verify_token)):
    q = db.query(Product)
    if active_only:
        q = q.filter(Product.active == True)
    return q.order_by(Product.category, Product.name).all()


@router.post('/', response_model=ProductOut, status_code=201)
def create_product(data: ProductIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    if db.query(Product).filter(Product.sku == data.sku).first():
        raise HTTPException(status_code=400, detail='SKU already exists')
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get('/{product_id}', response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    return product


@router.put('/{product_id}', response_model=ProductOut)
def update_product(product_id: int, data: ProductIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    existing = db.query(Product).filter(Product.sku == data.sku, Product.id != product_id).first()
    if existing:
        raise HTTPException(status_code=400, detail='SKU already in use')
    for field, value in data.model_dump().items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete('/{product_id}', status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    product.active = False  # soft delete — preserve sale history
    db.commit()


# ── Stock management ──────────────────────────────────────────────────────────

@router.get('/{product_id}/movements', response_model=List[StockMovementOut])
def list_movements(product_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    if not db.get(Product, product_id):
        raise HTTPException(status_code=404, detail='Product not found')
    return (
        db.query(StockMovement)
        .filter(StockMovement.product_id == product_id)
        .order_by(StockMovement.created_at.desc())
        .all()
    )


@router.post('/{product_id}/order', response_model=ProductOut, status_code=201)
def place_order(product_id: int, data: OrderIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    """Mark units as on order — paid, awaiting delivery."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    product.stock_on_order += data.quantity
    db.add(StockMovement(
        product_id=product_id,
        movement_type="order_placed",
        qty_delta=0,
        on_order_delta=data.quantity,
        notes=data.notes,
    ))
    db.commit()
    db.refresh(product)
    return product


@router.post('/{product_id}/receive', response_model=ProductOut, status_code=201)
def receive_order(product_id: int, data: OrderIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    """Move units from on-order to on-shelf when the delivery arrives."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    if data.quantity > product.stock_on_order:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot receive {data.quantity} — only {product.stock_on_order} on order"
        )
    product.stock_on_order -= data.quantity
    product.stock_qty += data.quantity
    db.add(StockMovement(
        product_id=product_id,
        movement_type="order_received",
        qty_delta=data.quantity,
        on_order_delta=-data.quantity,
        notes=data.notes,
    ))
    db.commit()
    db.refresh(product)
    return product


@router.post('/{product_id}/adjust', response_model=ProductOut, status_code=201)
def adjust_stock(product_id: int, data: AdjustmentIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    """Manual correction — positive adds, negative removes (damage, shrinkage, count fix)."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail='Product not found')
    if data.delta == 0:
        raise HTTPException(status_code=400, detail='delta cannot be zero')
    new_qty = product.stock_qty + data.delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail=f'Adjustment would result in negative stock ({new_qty})')
    product.stock_qty = new_qty
    db.add(StockMovement(
        product_id=product_id,
        movement_type="adjustment",
        qty_delta=data.delta,
        on_order_delta=0,
        notes=data.notes,
    ))
    db.commit()
    db.refresh(product)
    return product
