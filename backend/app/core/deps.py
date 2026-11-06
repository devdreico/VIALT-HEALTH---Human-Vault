from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db import engine
from app.models import User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    credentials_exc = HTTPException(
        status_code=401,
        detail="Token inválido o ausente",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if cred is None:
        raise credentials_exc
    payload = decode_access_token(cred.credentials)
    if not payload or not payload.get("sub"):
        raise credentials_exc
    with Session(engine) as session:
        user = session.get(User, payload["sub"])
        if not user:
            raise credentials_exc
        return user
