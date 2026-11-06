from fastapi import APIRouter

from app.config import settings
from app.services.ollama import ollama_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Estado del sistema: API + IA local + rutas de datos."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "vaults_dir": str(settings.vaults_dir),
        "ollama": await ollama_status(),
        "ollama_model": settings.ollama_model,
    }
