import re
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.config import settings
from app.core import ratelimit
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db import engine
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Schemas ────────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: str
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    nombre: str
    picture: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


def user_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id, email=user.email, nombre=user.nombre, picture=user.picture
    )


def _ensure_vault_dir(user: User) -> None:
    """Cada cuenta recibe su carpeta de vaults físicos (.md)."""
    (settings.vaults_dir / user.id).mkdir(parents=True, exist_ok=True)


# ── Registro / Login local ────────────────────────────────────────────────────
@router.post("/register", status_code=201, response_model=TokenOut)
def register(data: RegisterIn, request: Request) -> TokenOut:
    ratelimit.enforce(request, "register", limit=5, window=120)
    email = data.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "Correo inválido")
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio")

    with Session(engine) as session:
        existing = session.exec(
            select(User).where(User.email == email)  # type: ignore[arg-type]
        ).first()
        if existing:
            raise HTTPException(409, "Ese correo ya tiene una cuenta VIALT")

        user = User(email=email, nombre=nombre, password_hash=hash_password(data.password))
        session.add(user)
        session.commit()
        session.refresh(user)

    _ensure_vault_dir(user)
    return TokenOut(access_token=create_access_token(user), user=user_public(user))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request) -> TokenOut:
    ratelimit.enforce(request, "login", limit=10, window=60)
    email = data.email.strip().lower()
    with Session(engine) as session:
        user = session.exec(
            select(User).where(User.email == email)  # type: ignore[arg-type]
        ).first()
        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(401, "Credenciales incorrectas")
    return TokenOut(access_token=create_access_token(user), user=user_public(user))


# ── Sesión ────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    return user_public(user)


@router.get("/config")
def auth_config() -> dict:
    return {
        "google_enabled": bool(settings.google_client_id and settings.google_client_secret),
    }


# ── Google OAuth 2.0 ──────────────────────────────────────────────────────────
_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


@router.get("/google")
def google_start(response: Response) -> RedirectResponse:
    if not settings.google_client_id:
        raise HTTPException(503, "Google OAuth no configurado (VIALT_GOOGLE_CLIENT_ID/SECRET)")
    state = secrets.token_urlsafe(24)
    response.set_cookie(
        "vialt_oauth_state", state, max_age=600, httponly=True, samesite="lax"
    )
    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
def google_callback(code: str, state: str, request: Request) -> RedirectResponse:
    saved = request.cookies.get("vialt_oauth_state")
    if not saved or state != saved:
        raise HTTPException(400, "Estado OAuth inválido (intenta de nuevo)")

    with httpx.Client(timeout=15) as client:
        token_resp = client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(502, "No se pudo validar el código de Google")
        access = token_resp.json().get("access_token")
        if not access:
            raise HTTPException(502, "Google no devolvió token de acceso")
        userinfo = client.get(
            _GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access}"}
        ).json()

    sub = userinfo.get("sub")
    email = (userinfo.get("email") or "").lower()
    if not sub or not email:
        raise HTTPException(502, "Google no devolvió identidad suficiente")

    with Session(engine) as session:
        user = session.exec(select(User).where(User.google_sub == sub)).first()  # type: ignore[arg-type]
        if not user:
            # Vincula por correo si ya existe cuenta local con ese email
            user = session.exec(select(User).where(User.email == email)).first()  # type: ignore[arg-type]
        if not user:
            user = User(email=email)
        user.email = email
        user.google_sub = sub
        user.picture = userinfo.get("picture") or user.picture
        user.nombre = user.nombre or userinfo.get("name") or email.split("@")[0]
        session.add(user)
        session.commit()
        session.refresh(user)

    _ensure_vault_dir(user)
    token = create_access_token(user)
    return RedirectResponse(f"{settings.frontend_url}/auth/success#token={token}")
