from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.auth import verify_token
from app.models.service import Service

router = APIRouter()


class ServiceIn(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int
    category: Optional[str] = None
    active: bool = True


class ServiceOut(ServiceIn):
    id: int
    model_config = {"from_attributes": True}


@router.get("/", response_model=List[ServiceOut])
def list_services(db: Session = Depends(get_db), _=Depends(verify_token)):
    return db.query(Service).order_by(Service.category, Service.name).all()


@router.post("/", response_model=ServiceOut, status_code=201)
def create_service(data: ServiceIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    service = Service(**data.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.get("/{service_id}", response_model=ServiceOut)
def get_service(service_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    service = db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(service_id: int, data: ServiceIn, db: Session = Depends(get_db), _=Depends(verify_token)):
    service = db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    for field, value in data.model_dump().items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=204)
def delete_service(service_id: int, db: Session = Depends(get_db), _=Depends(verify_token)):
    service = db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    db.delete(service)
    db.commit()
