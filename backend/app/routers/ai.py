import json

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core import ratelimit
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db import engine
from app.models import ChatMessage, User
from app.services import ai_engine
from app.services.ai_engine import (
    augment_with_web,
    build_messages,
    log_turn,
    needs_web_search,
    ollama_chat_stream,
)
from app.services.mdfiles import vault_dir, write_md
from datetime import datetime
from app.services.search import searxng_search

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatIn(BaseModel):
    message: str


class GoalIn(BaseModel):
    titulo: str = ""
    contenido: str


@router.post("/{slug}/goals", status_code=201)
def save_goal(slug: str, data: GoalIn, user: User = Depends(get_current_user)) -> dict:
    """Guarda una recomendación de la IA como meta en Goals/."""
    d = vault_dir(user.id, slug)
    if not (d / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")
    hoy = datetime.now()
    fname = f"{hoy:%Y-%m-%d}-{hoy:%H%M%S}-meta.md"
    titulo = data.titulo.strip() or "Recomendación de la IA"
    body = f"# {titulo}\n\n{data.contenido.strip()[:3000]}\n"
    write_md(d / "Goals" / fname, {"titulo": titulo, "vialt": slug}, body, "vialt-ia")
    return {"ok": True, "path": f"Goals/{fname}"}


@router.get("/{slug}/history")
def history(slug: str, user: User = Depends(get_current_user)) -> list[dict]:
    if not (vault_dir(user.id, slug) / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")
    with Session(engine) as session:
        rows = session.exec(
            select(ChatMessage)  # type: ignore[arg-type]
            .where(ChatMessage.user_id == user.id, ChatMessage.slug == slug)  # type: ignore[arg-type]
            .order_by(ChatMessage.created_at.desc())  # type: ignore[union-attr]
            .limit(50)
        ).all()
        return [
            {"role": r.role, "content": r.content, "created_at": r.created_at.isoformat()}
            for r in reversed(rows)
        ]


@router.post("/{slug}/chat")
async def chat(slug: str, data: ChatIn, request: Request, user: User = Depends(get_current_user)):
    ratelimit.enforce(request, "chat", limit=15, window=60)
    """Chat SSE: tokens en vivo + fuentes web + guardado en historial y Time Vault/."""
    d = vault_dir(user.id, slug)
    if not (d / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")

    mensaje = data.message.strip()[:2000]
    if not mensaje:
        raise HTTPException(400, "Mensaje vacío")

    with Session(engine) as session:
        rows = session.exec(
            select(ChatMessage)  # type: ignore[arg-type]
            .where(ChatMessage.user_id == user.id, ChatMessage.slug == slug)  # type: ignore[arg-type]
            .order_by(ChatMessage.created_at.desc())  # type: ignore[union-attr]
            .limit(8)
        ).all()
        hist = [{"role": r.role, "content": r.content} for r in reversed(rows)]

    fuentes: list[dict] = []
    if needs_web_search(mensaje):
        fuentes = await searxng_search(mensaje)

    messages = build_messages(user.id, slug, hist, mensaje)
    await augment_with_web(messages, fuentes)

    with Session(engine) as session:
        session.add(ChatMessage(user_id=user.id, slug=slug, role="user", content=mensaje))
        session.commit()

    async def gen():
        full = ""
        try:
            async for tok in ollama_chat_stream(messages):
                full += tok
                yield f"data: {json.dumps({'type': 'token', 'data': tok}, ensure_ascii=False)}\n\n"
        except Exception as exc:  # pragma: no cover
            yield f"data: {json.dumps({'type': 'error', 'data': str(exc)}, ensure_ascii=False)}\n\n"

            if full:
                rel_log = log_turn(user.id, slug, mensaje, full, fuentes)
                with Session(engine) as session:
                    session.add(ChatMessage(user_id=user.id, slug=slug, role="assistant", content=full))
                    session.commit()
                yield f"data: {json.dumps({'type': 'done', 'data': {'log': rel_log, 'sources': fuentes}}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'data': 'El modelo no produjo respuesta'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
