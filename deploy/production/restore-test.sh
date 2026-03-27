#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./restore-test.sh <backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[ERROR] Backup file not found: $BACKUP_FILE"
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

echo "[INFO] Running restore test against temporary database flussio_restore_test"
$COMPOSE_CMD -f docker-compose.prod.yml exec -T db sh -lc 'createdb -U "$POSTGRES_USER" flussio_restore_test || true'

gzip -dc "$BACKUP_FILE" | $COMPOSE_CMD -f docker-compose.prod.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d flussio_restore_test'

$COMPOSE_CMD -f docker-compose.prod.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d flussio_restore_test -c "SELECT COUNT(*) AS users FROM users;"'
$COMPOSE_CMD -f docker-compose.prod.yml exec -T db sh -lc 'dropdb -U "$POSTGRES_USER" flussio_restore_test'

echo "[INFO] Restore test passed."
