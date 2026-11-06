from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="VIALT_", env_file=".env", extra="ignore"
    )

    app_name: str = "VIALT API"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # IA local
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:3b"

    # Búsqueda web (SearXNG self-hosted) — se usa en Fase 4
    searxng_base_url: str = "http://127.0.0.1:8888"

    # Datos
    vaults_dir: Path = BASE_DIR / "data" / "vaults"  # {token_usuario}/{vialt_slug}/
    db_file: Path = BASE_DIR / "data" / "vialt.db"  # solo índice de cuentas

    # Cifrado en reposo de los .md (Fernet). Vacío = sin cifrar (dev).
    vault_secret: str = ""

    # CORS extra en producción (coma separada, p. ej. dominio de Vercel)
    extra_cors: str = ""

    # Auth
    secret_key: str = "cambiar-en-produccion"
    algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12

    # Google OAuth (vacío = botón deshabilitado)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://127.0.0.1:8000/api/auth/google/callback"

    frontend_url: str = "http://localhost:5173"


settings = Settings()
