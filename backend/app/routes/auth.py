from fastapi import APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends
from app.auth import ADMIN_USERNAME, ADMIN_PASSWORD, create_access_token

router = APIRouter()


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    if form.username != ADMIN_USERNAME or form.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": form.username})
    return {"access_token": token, "token_type": "bearer"}
