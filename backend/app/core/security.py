from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings
from app.models import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    claims = {"sub": user.id, "email": user.email, "name": user.nombre, "exp": exp}
    return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
    except JWTError:
        return None
