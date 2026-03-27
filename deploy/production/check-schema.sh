#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE_PATH="${FLUSSIO_COMPOSE_FILE:-${COMPOSE_FILE:-docker-compose.prod.yml}}"

if [[ ! -f "$COMPOSE_FILE_PATH" ]]; then
  echo "[ERROR] Compose file not found: $COMPOSE_FILE_PATH"
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

echo "[INFO] Using compose file: $COMPOSE_FILE_PATH"
echo "[INFO] Copying SQL checker into db container"
$COMPOSE_CMD -f "$COMPOSE_FILE_PATH" cp check_schema.sql db:/work/check_schema.sql

echo "[INFO] Running schema checks..."
$COMPOSE_CMD -f "$COMPOSE_FILE_PATH" exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /work/check_schema.sql'
