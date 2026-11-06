"""Cálculo del puntaje de salud — reglas sobre la completitud del vault."""

from app.services.mdfiles import vault_dir, read_md

_DATOS = [
    ("tipo_sangre", "Tipo de sangre", 15),
    ("fecha_nacimiento", "Nacimiento", 15),
    ("sexo", "Sexo", 10),
    ("peso_kg", "Peso", 10),
    ("altura_cm", "Altura", 10),
]
_LISTAS = [
    ("condiciones", "Condiciones"),
    ("medicaciones", "Medicaciones"),
    ("alergias", "Alergias"),
    ("vacunas", "Vacunas"),
]


def health_score(user_id: str, slug: str) -> dict:
    """0-100 con componentes: 60 pts datos críticos + 40 listas clínicas."""
    d = vault_dir(user_id, slug)
    if not (d / "vialt.md").exists():
        return {"score": 0, "componentes": [], "faltan": [], "resumen": "Vault inexistente"}

    ufm = (read_md(d / "user.md") or {"frontmatter": {}})["frontmatter"]
    componentes: list[dict] = []
    faltan: list[str] = []
    score = 0

    for k, label, pts in _DATOS:
        ok = bool(ufm.get(k))
        if ok:
            score += pts
        else:
            faltan.append(label)
        componentes.append({"label": label, "got": pts if ok else 0, "max": pts})

    for fname, label in _LISTAS:
        items = (read_md(d / f"{fname}.md") or {"frontmatter": {}})["frontmatter"].get("items") or []
        ok = len(items) > 0
        if ok:
            score += 10
        else:
            faltan.append(label)
        componentes.append({"label": label, "got": 10 if ok else 0, "max": 10})

    resumen = (
        "Vault completo en lo esencial — todas las áreas cubiertas."
        if not faltan
        else "Falta registrar: " + ", ".join(faltan) + "."
    )
    return {
        "score": score,
        "componentes": componentes,
        "faltan": faltan,
        "resumen": resumen,
    }
