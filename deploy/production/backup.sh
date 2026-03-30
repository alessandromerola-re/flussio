#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE_PATH="${FLUSSIO_COMPOSE_FILE:-${COMPOSE_FILE:-docker-compose.prod.yml}}"
BACKUP_FILE="${1:-./flussio-backup-$(date +%Y%m%d-%H%M%S).sql.gz}"

if [[ ! -f "$COMPOSE_FILE_PATH" ]]; then
  echo "[ERROR] Compose file not found: $COMPOSE_FILE_PATH"
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

mkdir -p "$(dirname "$BACKUP_FILE")"

echo "[INFO] Using compose file: $COMPOSE_FILE_PATH"
echo "[INFO] Creating database backup: $BACKUP_FILE"
$COMPOSE_CMD -f "$COMPOSE_FILE_PATH" exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9' > "$BACKUP_FILE"

echo "[INFO] Backup completed."
