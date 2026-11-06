import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    """Cuenta propietaria de vaults. El token JWT nace de aquí."""

    __tablename__ = "users"

    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    email: str = Field(index=True, unique=True)
    nombre: str
    password_hash: str | None = None  # None si entra solo con Google
    google_sub: str | None = Field(default=None, index=True, unique=True)
    picture: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatMessage(SQLModel, table=True):
    """Historial de conversaciones por VIALT (memoria de la IA)."""

    __tablename__ = "chat_messages"

    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    user_id: str = Field(index=True)
    slug: str = Field(index=True)
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
