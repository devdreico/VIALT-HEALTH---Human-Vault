"""Motor del chat IA médica: contexto del vault + streaming + log en Time Vault."""

import json
import re
from datetime import datetime
from pathlib import Path

import httpx

from app.config import settings
from app.services.mdfiles import vault_dir, read_md, write_md

_NEEDS_WEB = re.compile(
    r"\b(efectos?|interacci[oó]n|interacciones|notici[oa]s?|actual(?:idad)?s?|"
    r"últim\w+|nuev\w+|por qué|cómo|quizás|significa|recomiend\w+|contact\w+|dosis)\b",
    re.IGNORECASE,
)

_REGLAS = (
    "Eres la IA médica local de VIALT (proyecto de Saniver, Colombia). Reglas duras:\n"
    "1. NUNCA diagnostiques ni prescribas. Analizas contexto, correlacionas y recomiendas.\n"
    "2. Ante síntomas graves o emergencia: pide ir a urgencias de inmediato.\n"
    "3. Responde SIEMPRE en español claro, breve, accionable. Sin inventar datos: si algo no está en el vault, dilo.\n"
    "4. Usa el CONTEXTO DEL VAULT como verdad del usuario (sangre, alergias, medicaciones, vacunas).\n"
    "5. Si hay RESULTADOS WEB, cita el dominio entre corchetes, p. ej. [minsalud.gov.co].\n"
    "6. Sustituye consejo médico profesional por análisis orientado; di siempre qué falta verificar.\n"
)

_MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _read(path: Path) -> dict:
    doc = read_md(path)
    return doc or {"frontmatter": {}, "body": ""}


def vault_context(user_id: str, slug: str) -> tuple[str, int, list[str]]:
    """Construye el bloque de contexto del vault + puntaje simple de completitud."""
    d = vault_dir(user_id, slug)
    ufm = _read(d / "user.md")["frontmatter"]

    puntos_user = [("tipo_sangre", 15), ("fecha_nacimiento", 15), ("sexo", 10), ("peso_kg", 10), ("altura_cm", 10)]
    score = 0
    faltan: list[str] = []
    for k, pts in puntos_user:
        if ufm.get(k):
            score += pts
        else:
            faltan.append(k)

    lineas_user = "\n".join(
        f"- {k}: {v}"
        for k, v in ufm.items()
        if k not in ("actualizado", "creado") and v is not None and v != ""
    ) or "- (user.md vacío)"

    listas = []
    for fname, etiq in [("condiciones", "CONDICIONES"), ("medicaciones", "MEDICACIONES"), ("alergias", "ALERGIAS"), ("vacunas", "VACUNAS")]:
        items = _read(d / f"{fname}.md")["frontmatter"].get("items") or []
        if items:
            score += 10
            nombres = "; ".join(str(i.get("nombre", "?")) for i in items[:6])
        else:
            faltan.append(etiq.lower())
            nombres = "ninguna registrada"
        listas.append(f"{etiq}: {nombres}")

    contexto = (
        "CONTEXTO DEL VAULT (datos reales de esta persona):\n"
        f"{lineas_user}\n" + "\n".join(listas) + "\n"
        f"PUNTAJE DE COMPLETITUD: {score}/100. FALTAN: {', '.join(faltan) or 'nada'}."
    )
    return contexto, score, faltan


def build_messages(user_id: str, slug: str, history: list[dict], mensaje: str) -> list[dict]:
    contexto, _s, _f = vault_context(user_id, slug)
    system = _REGLAS + "\n" + contexto
    msgs: list[dict] = [{"role": "system", "content": system}]
    for h in history[-6:]:
        msgs.append({"role": h["role"], "content": h["content"]})
    msgs.append({"role": "user", "content": mensaje})
    return msgs


async def augment_with_web(msgs: list[dict], sources: list[dict]) -> None:
    if not sources:
        return
    bloque = "\n".join(
        f"{i+1}) {s['title']} — {s['snippet']} — {s['url']}"
        for i, s in enumerate(sources)
    )
    msgs.insert(-1, {
        "role": "system",
        "content": "RESULTADOS WEB (cita dominio entre corchetes; descarta propaganda):\n" + bloque,
    })


async def ollama_chat_stream(messages: list[dict], num_predict: int = 180):
    payload = {
        "model": settings.ollama_model,
        "messages": messages,
        "stream": True,
        "keep_alive": "15m",
        "options": {"temperature": 0.6, "num_predict": num_predict, "num_ctx": 4096},
    }
    async with httpx.AsyncClient(
        base_url=settings.ollama_base_url, timeout=None
    ) as client:
        async with client.stream("POST", "/api/chat", json=payload) as resp:
            if resp.status_code != 200:
                detail = (await resp.read())[:200]
                raise RuntimeError(f"Ollama {resp.status_code}: {detail!r}")
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                tok = (chunk.get("message") or {}).get("content")
                if tok:
                    yield tok
                if chunk.get("done"):
                    break


def log_turn(user_id: str, slug: str, pregunta: str, respuesta: str, fuentes: list[dict]) -> str | None:
    """Deja rastro en Time Vault/ según la convención VIALT."""
    d = vault_dir(user_id, slug)
    if not (d / "vialt.md").exists():
        return None
    hoy = datetime.now()
    carpeta = d / "Time Vault" / str(hoy.year) / _MESES[hoy.month - 1] / str(hoy.day)
    fname = f"{hoy:%H%M%S}-ia.md"
    fuentes_txt = "\n".join(f"- {s['url']}" for s in fuentes) or "- (sin búsqueda web)"
    cuerpo = (
        f"# Interacción IA — {hoy:%Y-%m-%d %H:%M}\n\n"
        f"## Pregunta\n\n{pregunta.strip()[:1500]}\n\n"
        f"## Respuesta\n\n{respuesta.strip()[:3000]}\n\n"
        f"## Fuentes\n\n{fuentes_txt}\n"
    )
    write_md(carpeta / fname, {"tipo": "interaccion-ia", "vialt": slug}, cuerpo, "vialt-ia")
    return f"Time Vault/{hoy.year}/{_MESES[hoy.month - 1]}/{hoy.day}/{fname}"


def needs_web_search(mensaje: str) -> bool:
    return bool(_NEEDS_WEB.search(mensaje))
