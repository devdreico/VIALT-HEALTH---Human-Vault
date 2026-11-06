#!/usr/bin/env bash
# Respaldo diario de vaults .md + base de índice. Cron-friendly.
#   crontab -e:  15 3 * * * /ruta/vialt/backend/scripts/backup.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$DIR/backups}"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
tar -czf "$DEST/vialt-$STAMP.tar.gz" -C "$DIR/data" vaults vialt.db
# conserva los últimos 14
ls -1t "$DEST"/vialt-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "respaldo ok → $DEST/vialt-$STAMP.tar.gz"
