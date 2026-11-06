#!/usr/bin/env bash
# Respaldo manual/cron de datos legados antes de importarlos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${VIALT_LEGACY_DATA_DIR:-$ROOT/backend/data}"
DEST="${1:-$ROOT/backups/legacy}"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
tar -czf "$DEST/vialt-$STAMP.tar.gz" -C "$DATA_DIR" vaults vialt.db
# conserva los últimos 14
ls -1t "$DEST"/vialt-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "respaldo ok → $DEST/vialt-$STAMP.tar.gz"
