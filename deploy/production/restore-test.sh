#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE_PATH="${FLUSSIO_COMPOSE_FILE:-${COMPOSE_FILE:-docker-compose.prod.yml}}"
if [[ $# -lt 1 ]]; then
  echo "Usage: ./restore-test.sh <backup.sql.gz>"
  exit 1
fi
BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" || ! -f "$COMPOSE_FILE_PATH" ]]; then
  echo "[ERROR] Backup or Compose file not found."
  exit 1
fi
gzip -t "$BACKUP_FILE"
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  COMPOSE_CMD=(docker compose)
fi

# Never reuse/drop a pre-existing database, even after a previously interrupted test.
RESTORE_DB="flussio_restore_test_$$_${RANDOM}"
RESTORE_CREATED=false
cleanup() {
  local result=$?
  if [[ "$RESTORE_CREATED" == true ]]; then
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE_PATH" exec -T db sh -lc \
      'exec dropdb -U "$POSTGRES_USER" "$1"' sh "$RESTORE_DB" || result=1
  fi
  exit "$result"
}
trap cleanup EXIT
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE_PATH" exec -T db sh -lc \
  'exec createdb -U "$POSTGRES_USER" "$1"' sh "$RESTORE_DB"
RESTORE_CREATED=true
gzip -dc "$BACKUP_FILE" | "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE_PATH" exec -T db sh -lc \
  'exec psql -X -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$1"' sh "$RESTORE_DB"
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE_PATH" exec -T db sh -lc \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "SELECT COUNT(*) AS users FROM users;"' sh "$RESTORE_DB"
# Cleanup succeeds before announcing a successful test.
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE_PATH" exec -T db sh -lc \
  'exec dropdb -U "$POSTGRES_USER" "$1"' sh "$RESTORE_DB"
RESTORE_CREATED=false
echo "[INFO] Database restore test passed. Uploads must be verified separately."
