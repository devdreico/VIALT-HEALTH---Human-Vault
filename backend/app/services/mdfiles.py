"""Motor de vaults: lectura/escritura de archivos .md con frontmatter YAML.

Conviene a la filosofía VIALT: los datos reales viven en Markdown legible por
IA; el frontmatter da metadatos instantáneos y la firma -- 'Modificado por'
-- deja rastro de cada escritura.
"""

import re
from functools import lru_cache
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from app.config import settings

_FOOTER_RE = re.compile(r"\n+-{5,}\.?\s*-\s*Modificado por[^\n]*\n?$")

_ENC_PREFIX = "ENCv1:"


@lru_cache(maxsize=1)
def _fernet():
    if not settings.vault_secret:
        return None
    import base64
    import hashlib

    from cryptography.fernet import Fernet

    key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.vault_secret.encode()).digest()
    )
    return Fernet(key)

VIALT_FILES: tuple[str, ...] = ("user", "condiciones", "medicaciones", "alergias", "vacunas")


def vault_dir(user_id: str, slug: str = "") -> Path:
    """Raíz del usuario o carpeta de un VIALT concreto."""
    return settings.vaults_dir / user_id / slug


def read_md(path: Path) -> dict[str, Any] | None:
    """Devuelve {'frontmatter': dict, 'body': str} o None si no existe.

    Lee archivos planos o cifrados (ENCv1) de forma transparente."""
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, NotADirectoryError):
        return None
    f = _fernet()
    if raw.startswith(_ENC_PREFIX):
        if f is None:
            raise ValueError(
                f"Archivo cifrado sin VIALT_VAULT_SECRET: {path.name} — configura la llave"
            )
        raw = f.decrypt(raw[len(_ENC_PREFIX):].encode()).decode("utf-8")
    frontmatter: dict[str, Any] = {}
    body = raw
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.DOTALL)
    if m:
        try:
            frontmatter = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            frontmatter = {}
        body = m.group(2).lstrip("\n")
    return {"frontmatter": frontmatter, "body": body}


def write_md(
    path: Path,
    frontmatter: dict[str, Any] | None,
    body: str,
    modificado_por: str,
) -> None:
    """Crea/actualiza un .md preservando frontmatter anterior y dejando firma."""
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = read_md(path)
    fm: dict[str, Any] = dict(existing["frontmatter"]) if existing else {}
    fm.update(frontmatter or {})
    now = datetime.now(timezone.utc).isoformat()
    fm["actualizado"] = now
    if "creado" not in fm:
        fm["creado"] = now
    doc = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False).rstrip("\n")
    clean = _FOOTER_RE.sub("", body).strip()
    plain = f"---\n{doc}\n---\n\n{clean}\n\n------------- - Modificado por \"{modificado_por}\"\n"
    f = _fernet()
    if f is not None:
        path.write_text(_ENC_PREFIX + f.encrypt(plain.encode()).decode(), encoding="utf-8")
    else:
        path.write_text(plain, encoding="utf-8")


def edad_desde(fecha: str | None) -> int | None:
    if not fecha:
        return None
    try:
        f = datetime.strptime(str(fecha)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None
    hoy = date.today()
    return hoy.year - f.year - ((hoy.month, hoy.day) < (f.month, f.day))


def initialize_vault(user_id: str, slug: str, nombre: str, tipo: str = "raiz") -> dict:
    """Crea la estructura completa de un VIALT nuevo (o la asegura)."""
    d = vault_dir(user_id, slug)
    d.mkdir(parents=True, exist_ok=True)
    contexto = (
        f"# VIALT — {nombre}\n\n"
        f"Vault médico de una persona registrada bajo una cuenta VIALT.\n"
        f"Estructura esencial:\n"
        f"- user.md — datos médicos críticos y primordiales\n"
        f"- condiciones.md — diagnósticos y condiciones de salud\n"
        f"- medicaciones.md — fármacos, dosis y horarios\n"
        f"- alergias.md — alergias y reacciones conocidas\n"
        f"- vacunas.md — esquema de vacunación (PIV Colombia)\n\n"
        f"La IA autorizada analiza contexto, correlaciona y recomienda; nunca "
        f"diagnostica y jamás borra datos clínicos.\n"
    )
    write_md(d / "vialt.md", {"nombre": nombre, "tipo": tipo}, contexto, "vialt-system")
    for name in VIALT_FILES:
        fp = d / f"{name}.md"
        if not fp.exists():
            titulo = {"user": "user.md — Información crítica del paciente"}.get(
                name, f"# {name.capitalize()}"
            )
            write_md(fp, {}, f"{titulo}\n", "vialt-system")
    return summarize_vault(user_id, slug)


def summarize_vault(user_id: str, slug: str) -> dict:
    d = vault_dir(user_id, slug)
    vialt = read_md(d / "vialt.md") or {"frontmatter": {}}
    user_doc = read_md(d / "user.md") or {"frontmatter": {}}
    vfm = vialt["frontmatter"]
    ufm = user_doc["frontmatter"]
    return {
        "slug": slug,
        "nombre": vfm.get("nombre") or ufm.get("nombre") or slug,
        "tipo": vfm.get("tipo", "persona"),
        "edad": edad_desde(ufm.get("fecha_nacimiento")),
        "sexo": ufm.get("sexo"),
        "tipo_sangre": ufm.get("tipo_sangre"),
        "actualizado": vfm.get("actualizado"),
        "creado": vfm.get("creado"),
    }


def list_vaults(user_id: str) -> list[dict]:
    root = vault_dir(user_id)
    if not root.exists():
        return []
    salida = []
    for d in sorted(root.iterdir(), key=lambda p: p.name):
        if d.is_dir() and (d / "vialt.md").exists():
            salida.append(summarize_vault(user_id, d.name))
    return salida


def list_subdir_items(user_id: str, slug: str, subdir: str, limite: int = 50) -> list[dict]:
    """Items de un subdirectorio (Goals/, IA/, …) con frontmatter resumido."""
    base = vault_dir(user_id, slug) / subdir
    if not base.exists():
        return []
    out: list[dict] = []
    for p in sorted(base.rglob("*.md"), key=lambda x: x.name, reverse=True)[:limite]:
        doc = read_md(p)
        fm = (doc or {}).get("frontmatter", {})
        out.append(
            {
                "path": p.relative_to(vault_dir(user_id, slug)).as_posix(),
                "titulo": str(fm.get("titulo") or fm.get("nombre") or p.stem),
                "tipo": str(fm.get("tipo") or "nota"),
                "creado": fm.get("creado"),
            }
        )
    return out
