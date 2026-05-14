from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, model_validator

from app.database import get_db
from app.auth import verify_token
from app.models.promotion import Promotion

router = APIRouter()


class PromotionIn(BaseModel):
    name: str
    code: str
    discount_type: str   # 'percentage' | 'fixed'
    discount_value: float
    min_purchase: Optional[float] = None
    start_date: datetime
    end_date: datetime
    active: bool = True
    max_uses: Optional[int] = None

    @model_validator(mode='after')
    def validate_dates_and_value(self):
        if self.end_date <= self.start_date:
            raise ValueError('end_date must be after start_date')
        if self.discount_type == 'percentage' and not (0 < self.discount_value <= 100):
            raise ValueError('Percentage discount must be between 0 and 100')
        if self.discount_type == 'fixed' and self.discount_value <= 0:
            raise ValueError('Fixed discount must be greater than 0')
        return self


class PromotionOut(PromotionIn):
    id: int
    uses_count: int
    created_at: datetime
    model_config = {'from_attributes': True}


@router.get('/', response_model=List[PromotionOut])
def list_promotions(db: Session = Depends(get_db), _=Depends(verify_token)):
    return db.query(Promotion).order_by(Promotion.start_date.desc()).all()


@router.post('/', response_model=PromotionOut, status_code=201)
def create_promotion(data: PromotionIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    if db.query(Promotion).filter(Promotion.code == data.code.upper()).first():
        raise HTTPException(status_code=400, detail='Promotion code already exists')
    promo = Promotion(**{**data.model_dump(), 'code': data.code.upper()})
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return promo


@router.get('/validate/{code}')
def validate_code(code: str, subtotal: float = 0, db: Session = Depends(get_db), _=Depends(verify_token)):
    """Look up a promo code and return discount info, or 404 if invalid/expired."""
    promo = db.query(Promotion).filter(Promotion.code == code.upper()).first()
    if not promo or not promo.active:
        raise HTTPException(status_code=404, detail='Invalid or inactive promo code')
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if now < promo.start_date or now > promo.end_date:
        raise HTTPException(status_code=400, detail='Promo code is not currently valid')
    if promo.max_uses and promo.uses_count >= promo.max_uses:
        raise HTTPException(status_code=400, detail='Promo code has reached its usage limit')
    if promo.min_purchase and subtotal < promo.min_purchase:
        raise HTTPException(status_code=400, detail=f'Minimum purchase of ${promo.min_purchase:.2f} required')

    if promo.discount_type == 'percentage':
        discount = round(subtotal * promo.discount_value / 100, 2)
    else:
        discount = min(promo.discount_value, subtotal)

    return {
        'id': promo.id,
        'name': promo.name,
        'code': promo.code,
        'discount_type': promo.discount_type,
        'discount_value': promo.discount_value,
        'discount_amount': discount,
    }


@router.get('/{promo_id}', response_model=PromotionOut)
def get_promotion(promo_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    promo = db.get(Promotion, promo_id)
    if not promo:
        raise HTTPException(status_code=404, detail='Promotion not found')
    return promo


@router.put('/{promo_id}', response_model=PromotionOut)
def update_promotion(promo_id: int, data: PromotionIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    promo = db.get(Promotion, promo_id)
    if not promo:
        raise HTTPException(status_code=404, detail='Promotion not found')
    existing = db.query(Promotion).filter(Promotion.code == data.code.upper(), Promotion.id != promo_id).first()
    if existing:
        raise HTTPException(status_code=400, detail='Promo code already in use')
    for field, value in data.model_dump().items():
        setattr(promo, field, value if field != 'code' else value.upper())
    db.commit()
    db.refresh(promo)
    return promo


@router.delete('/{promo_id}', status_code=204)
def delete_promotion(promo_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    promo = db.get(Promotion, promo_id)
    if not promo:
        raise HTTPException(status_code=404, detail='Promotion not found')
    promo.active = False
    db.commit()
