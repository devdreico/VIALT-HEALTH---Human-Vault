import httpx

from app.config import settings


async def ollama_status() -> dict:
    """Ping al daemon local de Ollama y lista de modelos instalados."""
    try:
        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url, timeout=3
        ) as client:
            resp = await client.get("/api/tags")
            resp.raise_for_status()
            models = [m.get("name") for m in resp.json().get("models", [])]
            return {"connected": True, "models": models}
    except Exception:
        return {"connected": False, "models": []}
