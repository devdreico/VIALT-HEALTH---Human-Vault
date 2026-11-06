#!/usr/bin/env python3
"""Import legacy VIALT SQLite/Markdown data into an existing Supabase project.

Accounts must already exist and be verified in Supabase Auth. This script never
imports password hashes or creates/link identities. Run --dry-run (the default)
before the explicit --apply mode, and use a database backup.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml

ROOT = Path(__file__).resolve().parents[1]
LEGACY_DATA = ROOT / "backend" / "data"
DATABASE = Path(os.environ.get("VIALT_DB_FILE", LEGACY_DATA / "vialt.db"))
VAULTS_DIR = Path(os.environ.get("VIALT_VAULTS_DIR", LEGACY_DATA / "vaults"))
VAULT_SECRET = os.environ.get("VIALT_VAULT_SECRET", "")
ENC_PREFIX = "ENCv1:"

_NAMESPACE = uuid.UUID("4749414c-542d-4c54-9e7e-544d4f555345")
_BATCH_SIZE = 100


def stable_id(value: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, value))


def timestamp(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def frontmatter(path: Path) -> dict[str, Any]:
    document = read_md(path)
    if document is None:
        return {}
    value = document.get("frontmatter") or {}
    return value if isinstance(value, dict) else {}


def read_md(path: Path) -> dict[str, Any] | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, NotADirectoryError):
        return None
    if raw.startswith(ENC_PREFIX):
        if not VAULT_SECRET:
            raise RuntimeError(
                f"El archivo {path.name} está cifrado; define VIALT_VAULT_SECRET para importarlo"
            )
        from cryptography.fernet import Fernet

        key = base64.urlsafe_b64encode(hashlib.sha256(VAULT_SECRET.encode()).digest())
        try:
            raw = Fernet(key).decrypt(raw[len(ENC_PREFIX):].encode()).decode("utf-8")
        except Exception as error:
            raise RuntimeError(f"No se pudo descifrar {path.name}; verifica VIALT_VAULT_SECRET") from error

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.DOTALL)
    if not match:
        return {"frontmatter": {}, "body": raw}
    try:
        metadata = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError as error:
        raise RuntimeError(f"Frontmatter YAML inválido en {path.name}") from error
    return {
        "frontmatter": metadata if isinstance(metadata, dict) else {},
        "body": match.group(2).lstrip("\n"),
    }


def vault_dir(user_id: str, slug: str = "") -> Path:
    return VAULTS_DIR / user_id / slug


def list_vaults(user_id: str) -> list[dict[str, Any]]:
    root = vault_dir(user_id)
    if not root.is_dir():
        return []
    result = []
    for directory in sorted(root.iterdir(), key=lambda item: item.name):
        metadata = frontmatter(directory / "vialt.md") if directory.is_dir() else {}
        if metadata:
            result.append({
                "slug": directory.name,
                "nombre": metadata.get("nombre") or directory.name,
                "tipo": metadata.get("tipo", "persona"),
                "creado": metadata.get("creado"),
                "actualizado": metadata.get("actualizado"),
            })
    return result


def read_users(database: Path) -> list[dict[str, Any]]:
    with sqlite3.connect(database) as connection:
        connection.row_factory = sqlite3.Row
        try:
            return [dict(row) for row in connection.execute(
                "select id, email, nombre from users order by email"
            )]
        except sqlite3.Error as error:
            raise RuntimeError(f"No se pudieron leer las cuentas SQLite: {error}") from error


def read_chat(database: Path) -> list[dict[str, Any]]:
    with sqlite3.connect(database) as connection:
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute(
                "select id, user_id, slug, role, content, created_at "
                "from chat_messages order by created_at, id"
            )
            return [dict(row) for row in rows]
        except sqlite3.Error as error:
            raise RuntimeError(f"No se pudo leer el historial SQLite: {error}") from error


def admin_client(base_url: str, service_key: str) -> httpx.Client:
    return httpx.Client(
        base_url=base_url.rstrip("/"),
        timeout=45,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
    )


def auth_users(client: httpx.Client) -> dict[str, str]:
    page = 1
    by_email: dict[str, str] = {}
    while True:
        response = client.get(
            "/auth/v1/admin/users",
            params={"page": page, "per_page": 1000},
        )
        response.raise_for_status()
        users = response.json().get("users", [])
        for user in users:
            email = (user.get("email") or "").strip().lower()
            if email and user.get("id"):
                by_email[email] = user["id"]
        if len(users) < 1000:
            return by_email
        page += 1


def upsert(client: httpx.Client, table: str, conflict: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for start in range(0, len(rows), _BATCH_SIZE):
        batch = rows[start : start + _BATCH_SIZE]
        if not batch:
            continue
        response = client.post(
            f"/rest/v1/{table}",
            params={"on_conflict": conflict},
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=batch,
        )
        if not response.is_success:
            raise RuntimeError(
                f"Falló la importación de {table} (HTTP {response.status_code}): "
                f"{response.text[:500]}"
            )
        result.extend(response.json())
    return result


def build_vialt_rows(
    users: list[dict[str, Any]], auth_ids: dict[str, str]
) -> tuple[list[dict[str, Any]], dict[tuple[str, str], str]]:
    rows: list[dict[str, Any]] = []
    legacy_to_auth: dict[str, str] = {}
    for user in users:
        auth_id = auth_ids.get(str(user["email"]).strip().lower())
        if not auth_id:
            continue
        legacy_to_auth[str(user["id"])] = auth_id
        for summary in list_vaults(str(user["id"])):
            directory = vault_dir(str(user["id"]), summary["slug"])
            vault_meta = frontmatter(directory / "vialt.md")
            rows.append({
                "id": stable_id(f"vialt:{auth_id}:{summary['slug']}"),
                "owner_id": auth_id,
                "slug": summary["slug"],
                "nombre": str(vault_meta.get("nombre") or summary["nombre"]),
                "tipo": vault_meta.get("tipo") if vault_meta.get("tipo") in ("raiz", "persona") else "persona",
                **({"created_at": created} if (created := timestamp(vault_meta.get("creado")) or timestamp(summary.get("creado"))) else {}),
                **({"updated_at": updated} if (updated := timestamp(vault_meta.get("actualizado")) or timestamp(summary.get("actualizado"))) else {}),
            })
    return rows, {(row["owner_id"], row["slug"]): row["id"] for row in rows}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--vaults", type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Ejecuta la importación")
    mode.add_argument("--dry-run", action="store_true", help="Solo muestra conteos; es el modo predeterminado")
    parser.add_argument("--supabase-url", default=None)
    args = parser.parse_args()

    global VAULTS_DIR
    args.database = args.database or DATABASE
    args.vaults = args.vaults or VAULTS_DIR

    if not args.database.is_file():
        parser.error(f"No existe la base SQLite: {args.database}")
    if not args.vaults.is_dir():
        parser.error(f"No existe el directorio de vaults: {args.vaults}")
    VAULTS_DIR = args.vaults

    users = read_users(args.database)
    messages = read_chat(args.database)
    vault_count = sum(len(list_vaults(str(user["id"]))) for user in users)
    print(f"Cuentas legado: {len(users)}")
    print(f"VIALTs encontrados: {vault_count}")
    print(f"Mensajes encontrados: {len(messages)}")
    if not args.apply:
        print("Modo simulación: no se realizó ninguna escritura. Usa --apply tras revisar backups y cuentas.")
        return 0

    base_url = args.supabase_url or os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        parser.error("--apply requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno")

    database_url = base_url.rstrip("/")
    with admin_client(database_url, service_key) as client:
        auth_ids = auth_users(client)
        missing = [
            str(user["email"]).strip().lower()
            for user in users
            if str(user["email"]).strip().lower() not in auth_ids
        ]
        if missing:
            masked = [email[:2] + "***" + email[email.find("@"):] for email in missing]
            raise RuntimeError(
                f"{len(missing)} cuentas aún no existen en Supabase Auth; "
                f"créelas/verifícalas primero. Correos pendientes: {', '.join(masked)}"
            )

        profiles = []
        for user in users:
            auth_id = auth_ids[str(user["email"]).strip().lower()]
            profiles.append({"id": auth_id, "email": user["email"], "nombre": user["nombre"] or ""})
        upsert(client, "profiles", "id", profiles)

        vialt_rows, _ = build_vialt_rows(users, auth_ids)
        for row in vialt_rows:
            existing_response = client.get(
                "/rest/v1/vialts",
                params={
                    "select": "id",
                    "owner_id": f"eq.{row['owner_id']}",
                    "slug": f"eq.{row['slug']}",
                },
            )
            existing_response.raise_for_status()
            existing = existing_response.json()
            if existing and existing[0]["id"] != row["id"]:
                raise RuntimeError(
                    f"El VIALT '{row['slug']}' ya existe y no fue creado por este importador; "
                    "se cancela para no sustituir IDs ni mezclar datos."
                )
        imported_vialts = upsert(client, "vialts", "owner_id,slug", vialt_rows)
        actual_vialt_ids = {
            (row["owner_id"], row["slug"]): row["id"] for row in imported_vialts
        }
        legacy_to_auth = {
            str(user["id"]): auth_ids[str(user["email"]).strip().lower()]
            for user in users
        }

        patient_rows: list[dict[str, Any]] = []
        clinical_rows: list[dict[str, Any]] = []
        goal_rows: list[dict[str, Any]] = []
        consent_rows: list[dict[str, Any]] = []
        for user in users:
            legacy_user_id = str(user["id"])
            owner_id = legacy_to_auth[legacy_user_id]
            for summary in list_vaults(legacy_user_id):
                slug = summary["slug"]
                vialt_id = actual_vialt_ids[(owner_id, slug)]
                directory = vault_dir(legacy_user_id, slug)
                user_meta = frontmatter(directory / "user.md")
                profile_fields = {
                    key: user_meta.get(key)
                    for key in (
                        "fecha_nacimiento", "sexo", "tipo_sangre", "peso_kg",
                        "altura_cm", "contacto_emergencia",
                    )
                    if user_meta.get(key) is not None
                }
                if profile_fields:
                    patient_row = {
                        "vialt_id": vialt_id,
                        "owner_id": owner_id,
                        **profile_fields,
                    }
                    if created := timestamp(user_meta.get("creado")):
                        patient_row["created_at"] = created
                    if updated := timestamp(user_meta.get("actualizado")):
                        patient_row["updated_at"] = updated
                    patient_rows.append(patient_row)

                for category in ("condiciones", "medicaciones", "alergias", "vacunas"):
                    values = frontmatter(directory / f"{category}.md").get("items") or []
                    if not isinstance(values, list):
                        continue
                    for index, value in enumerate(values):
                        if isinstance(value, dict) and value.get("nombre"):
                            clinical_rows.append({
                                "id": stable_id(f"clinical:{owner_id}:{slug}:{category}:{index}:{json.dumps(value, sort_keys=True, ensure_ascii=False)}"),
                                "owner_id": owner_id,
                                "vialt_id": vialt_id,
                                "category": category,
                                "data": value,
                            })

                goals_dir = directory / "Goals"
                if goals_dir.is_dir():
                    for path in sorted(goals_dir.rglob("*.md")):
                        meta = frontmatter(path)
                        document = read_md(path)
                        body = (document or {}).get("body", "").strip()
                        title = str(meta.get("titulo") or path.stem)[:160]
                        if body:
                            goal_row = {
                                "id": stable_id(f"goal:{owner_id}:{slug}:{path.relative_to(directory).as_posix()}"),
                                "owner_id": owner_id,
                                "vialt_id": vialt_id,
                                "titulo": title,
                                "contenido": body[:3000],
                            }
                            if created := timestamp(meta.get("creado")):
                                goal_row["created_at"] = created
                            goal_rows.append(goal_row)

                consent_meta = frontmatter(directory / "consentimiento.md")
                if consent_meta.get("aceptado") is True:
                    accepted_at = timestamp(consent_meta.get("actualizado")) or timestamp(consent_meta.get("creado"))
                    if accepted_at is None:
                        raise RuntimeError(
                            f"Falta la fecha de consentimiento del VIALT '{slug}'; no se importará un consentimiento sin fecha."
                        )
                    consent_rows.append({
                        "id": stable_id(f"consent:{owner_id}:{slug}"),
                        "owner_id": owner_id,
                        "vialt_id": vialt_id,
                        "policy_version": f"{consent_meta.get('ley', 'legacy')}-v{consent_meta.get('version', 1)}",
                        "accepted": True,
                        "source": "onboarding",
                        "accepted_at": accepted_at,
                    })

        upsert(client, "patient_profiles", "vialt_id", patient_rows)
        upsert(client, "clinical_items", "id", clinical_rows)
        upsert(client, "goals", "id", goal_rows)
        upsert(client, "consent_events", "id", consent_rows)

        chat_rows = []
        for message in messages:
            owner_id = legacy_to_auth.get(str(message["user_id"]))
            vialt_id = actual_vialt_ids.get((owner_id, str(message["slug"]))) if owner_id else None
            if not owner_id or not vialt_id or message["role"] not in ("user", "assistant"):
                continue
            chat_rows.append({
                "id": stable_id(f"chat:{message['id']}"),
                "owner_id": owner_id,
                "vialt_id": vialt_id,
                "role": message["role"],
                "content": str(message["content"])[:12000],
                "created_at": timestamp(message["created_at"]),
            })
        upsert(client, "chat_messages", "id", chat_rows)

    print("Importación completada.")
    print(f"Perfiles: {len(profiles)}; VIALTs: {len(vialt_rows)}; perfiles clínicos: {len(patient_rows)}")
    print(f"Elementos clínicos: {len(clinical_rows)}; metas: {len(goal_rows)}; consentimientos: {len(consent_rows)}; mensajes: {len(chat_rows)}")
    print("Verifica conteos y muestras en Supabase antes de permitir nuevas escrituras.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Error de migración: {error}", file=sys.stderr)
        raise SystemExit(1)
