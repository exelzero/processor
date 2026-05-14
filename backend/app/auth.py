from datetime import datetime, timedelta

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = "processor-secret-key-change-in-prod"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8-hour sessions

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "password"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str = Depends(oauth2_scheme)):
    """
    Auth guard — itself a dependency with a nested dependency.

    Depends(oauth2_scheme) is resolved first: OAuth2PasswordBearer extracts
    the Bearer token string from the Authorization header and raises 401 if
    it is absent.  FastAPI then passes that string as `token` here.

    Dependencies form a DAG (directed acyclic graph).  FastAPI resolves the
    full graph depth-first before calling the route handler:

        route handler
          └── Depends(verify_token)       ← resolved second
                └── Depends(oauth2_scheme) ← resolved first

    Each node in the graph is called at most once per request regardless of
    how many handlers declare it — the result is cached for the request scope.
    This means adding verify_token to a second parameter on the same route
    costs nothing: the JWT is decoded only once.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username != ADMIN_USERNAME:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return username
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
