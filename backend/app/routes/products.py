from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.auth import verify_token
from app.models.product import Product

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
    created_at: datetime
    model_config = {'from_attributes': True}


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
