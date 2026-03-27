#!/usr/bin/env bash
set -euo pipefail

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

BACKUP_FILE="${1:-./data/backups/flussio-backup-$(date +%Y%m%d-%H%M%S).sql.gz}"
mkdir -p "$(dirname "$BACKUP_FILE")"

echo "[INFO] Creating database backup: $BACKUP_FILE"
$COMPOSE_CMD -f docker-compose.prod.yml exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9' > "$BACKUP_FILE"

echo "[INFO] Backup completed."
