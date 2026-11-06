from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.services.mdfiles import (
    edad_desde,
    initialize_vault,
    read_md,
    summarize_vault,
    vault_dir,
    write_md,
)
from app.core.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

_SLUG = "raiz"


# ── Schemas ────────────────────────────────────────────────────────────────────
class Persona(BaseModel):
    nombre: str
    fecha_nacimiento: str  # YYYY-MM-DD
    sexo: str  # M | F | otro | s.f.
    tipo_sangre: str  # A+, A-, B+, B-, AB+, AB-, O+, O-, desconocido
    peso_kg: float | None = None
    altura_cm: float | None = None
    contacto_emergencia: str | None = None


class Condicion(BaseModel):
    nombre: str
    tipo: str = "cronico"
    desde: str = ""
    detalle: str = ""


class Medicacion(BaseModel):
    nombre: str
    dosis: str = ""
    frecuencia: str = ""
    horario: str = ""
    motivo: str = ""
    desde: str = ""


class Alergia(BaseModel):
    nombre: str
    tipo: str = "medicamento"
    reaccion: str = ""
    severidad: str = "moderada"


class Vacuna(BaseModel):
    nombre: str
    fecha: str = ""
    estado: str = "completo"


class OnboardingIn(BaseModel):
    persona: Persona
    condiciones: list[Condicion] = []
    medicaciones: list[Medicacion] = []
    alergias: list[Alergia] = []
    vacunas: list[Vacuna] = []
    consentimiento: bool = True


def _items_doc(path, titulo: str, items: list[dict], lineas: list[str], empty: str) -> None:
    if lineas:
        body = f"# {titulo}\n\n" + "\n".join(lineas)
    else:
        body = f"# {titulo}\n\n{empty}"
    write_md(path, {"items": items}, body, "vialt-system")


@router.get("/status")
def status(user: User = Depends(get_current_user)) -> dict:
    doc = read_md(vault_dir(user.id, _SLUG) / "user.md")
    return {"completado": bool(doc and doc["frontmatter"]), "slug": _SLUG}


@router.post("/complete")
def complete(data: OnboardingIn, user: User = Depends(get_current_user)) -> dict:
    """Escribe los datos médicos críticos en los .md del VIALT raíz."""
    p = data.persona
    initialize_vault(user.id, _SLUG, p.nombre)
    d = vault_dir(user.id, _SLUG)

    fm_user = {
        "nombre": p.nombre,
        "fecha_nacimiento": p.fecha_nacimiento,
        "sexo": p.sexo,
        "tipo_sangre": p.tipo_sangre,
        "peso_kg": p.peso_kg,
        "altura_cm": p.altura_cm,
        "contacto_emergencia": p.contacto_emergencia,
    }
    user_body = "\n".join(
        f"- **{k}:** {v}"
        for k, v in [
            ("Nombre", p.nombre),
            ("Nacimiento", f"{p.fecha_nacimiento} (~{edad_desde(p.fecha_nacimiento) or '¿?'} años)"),
            ("Sexo", p.sexo),
            ("Tipo de sangre", p.tipo_sangre),
            ("Peso", f"{p.peso_kg} kg" if p.peso_kg else "s.f."),
            ("Altura", f"{p.altura_cm} cm" if p.altura_cm else "s.f."),
            ("Contacto emergencia", p.contacto_emergencia or "s.f."),
        ]
    )
    write_md(
        d / "user.md",
        fm_user,
        f"# Información crítica del paciente\n\n{user_body}\n",
        "vialt-system",
    )

    conds = [c.model_dump() for c in data.condiciones]
    _items_doc(
        d / "condiciones.md",
        "Condiciones médicas",
        conds,
        [
            f"- **{c.nombre}** — {c.tipo or 'crónico'} · desde: {c.desde or 's.f.'}"
            + (f" — {c.detalle}" if c.detalle else "")
            for c in data.condiciones
        ],
        "_Sin condiciones registradas._",
    )

    _items_doc(
        d / "medicaciones.md",
        "Medicaciones",
        [m.model_dump() for m in data.medicaciones],
        [
            f"- **{m.nombre}** — dosis: {m.dosis or 's.f.'} · {m.frecuencia or 's.f.'}"
            + (f" · motivo: {m.motivo}" if m.motivo else "")
            for m in data.medicaciones
        ],
        "_Sin medicaciones registradas._",
    )

    _items_doc(
        d / "alergias.md",
        "Alergias",
        [a.model_dump() for a in data.alergias],
        [
            f"- {'⚠️ SEVERA — ' if a.severidad == 'severa' else ''}**{a.nombre}** — {a.tipo or 's.f.'}"
            + (f" · reacción: {a.reaccion}" if a.reaccion else "")
            for a in data.alergias
        ],
        "_Sin alergias registradas._",
    )

    _items_doc(
        d / "vacunas.md",
        "Vacunas",
        [v.model_dump() for v in data.vacunas],
        [
            f"- **{v.nombre}** — {v.estado}" + (f" · {v.fecha}" if v.fecha else "")
            for v in data.vacunas
        ],
        "_Sin vacunas registradas._",
    )

    if data.consentimiento:
        write_md(
            vault_dir(user.id, _SLUG) / "consentimiento.md",
            {"ley": "1581/2012", "aceptado": True, "version": 1},
            (
                "# Consentimiento de tratamiento de datos\n\n"
                f"El titular autoriza el tratamiento de sus datos sensibles de salud "
                f"según la Ley 1581 de 2012 (Colombia), exclusivamente dentro del "
                f"sistema VIALT de Saniver. La IA analiza, correlaciona y recomienda; "
                f"nunca diagnostica ni sustituye consejo médico profesional.\n"
            ),
            "vialt-system",
        )

    return {"ok": True, "vault": summarize_vault(user.id, _SLUG)}
