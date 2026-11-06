import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models import User
from app.services.mdfiles import (
    VIALT_FILES,
    edad_desde,
    initialize_vault,
    list_subdir_items,
    list_vaults,
    read_md,
    summarize_vault,
    vault_dir,
    write_md,
)
from app.services.health import health_score

router = APIRouter(prefix="/vialts", tags=["vialts"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")


class CreateVialt(BaseModel):
    nombre: str
    slug: str | None = None


class ProfileUpdate(BaseModel):
    fecha_nacimiento: str | None = None
    sexo: str | None = None
    tipo_sangre: str | None = None
    peso_kg: float | None = None
    altura_cm: float | None = None
    contacto_emergencia: str | None = None


def _slugify(nombre: str) -> str:
    s = re.sub(r"[^a-z0-9-]+", "-", nombre.lower().strip())
    return re.sub(r"-{2,}", "-", s).strip("-")[:40] or f"vialt-{secrets.token_hex(3)}"


@router.get("")
def get_vialts(user: User = Depends(get_current_user)) -> list[dict]:
    salida = list_vaults(user.id)
    for s in salida:
        s["score"] = health_score(user.id, s["slug"])["score"]
    return salida


@router.post("", status_code=201)
def create_vialt(data: CreateVialt, user: User = Depends(get_current_user)) -> dict:
    """Crea un VIALT nuevo alrededor de otra persona (familiar, paciente…)."""
    slug = _slugify(data.slug or data.nombre)
    if not _SLUG_RE.match(slug):
        slug = f"vialt-{secrets.token_hex(3)}"
    if (vault_dir(user.id, slug) / "vialt.md").exists():
        raise HTTPException(409, "Ya existe un VIALT con ese identificador")
    return initialize_vault(user.id, slug, data.nombre.strip(), tipo="persona")


@router.get("/{slug}")
def get_vialt(slug: str, user: User = Depends(get_current_user)) -> dict:
    d = vault_dir(user.id, slug)
    if not (d / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")
    files = {}
    for name in VIALT_FILES:
        doc = read_md(d / f"{name}.md")
        files[name] = doc["frontmatter"] if doc else {}
    consent = bool((d / "consentimiento.md").exists())
    return {"summary": summarize_vault(user.id, slug), "files": files, "consentimiento": consent}


@router.patch("/{slug}/profile")
def update_profile(
    slug: str,
    data: ProfileUpdate,
    user: User = Depends(get_current_user),
) -> dict:
    """Actualiza campos de user.md sin tocar datos clínicos."""
    d = vault_dir(user.id, slug)
    if not (d / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")
    doc = read_md(d / "user.md")
    if doc is None:
        raise HTTPException(404, "user.md inexistente")
    fm = {k: v for k, v in data.model_dump().items() if v is not None}
    if fm:
        write_md(d / "user.md", fm, doc["body"], "vialt-system")
    return summarize_vault(user.id, slug)


@router.get("/{slug}/health")
def get_health(slug: str, user: User = Depends(get_current_user)) -> dict:
    if not (vault_dir(user.id, slug) / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")
    return health_score(user.id, slug)


@router.get("/{slug}/goals")
def get_goals(slug: str, user: User = Depends(get_current_user)) -> list[dict]:
    if not (vault_dir(user.id, slug) / "vialt.md").exists():
        raise HTTPException(404, "VIALT no encontrado")
    return list_subdir_items(user.id, slug, "Goals")
