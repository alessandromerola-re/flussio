#!/usr/bin/env bash
set -euo pipefail

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

echo "[INFO] Copying SQL checker into db container"
$COMPOSE_CMD -f docker-compose.prod.yml cp check_schema.sql db:/work/check_schema.sql

echo "[INFO] Running schema checks..."
$COMPOSE_CMD -f docker-compose.prod.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /work/check_schema.sql'
