#!/usr/bin/env bash
set -euo pipefail

# Optional helper wrapper.
# Official install path is documented as direct docker compose commands.

COMPOSE_FILE_PATH="${FLUSSIO_COMPOSE_FILE:-${COMPOSE_FILE:-docker-compose.prod.yml}}"

if [[ ! -f ".env" ]]; then
  echo "[ERROR] Missing .env file. Copy .env.example.prod to .env and fill mandatory values."
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE_PATH" ]]; then
  echo "[ERROR] Compose file not found: $COMPOSE_FILE_PATH"
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

echo "[INFO] Optional helper detected. Recommended manual commands are:"
echo "       $COMPOSE_CMD -f $COMPOSE_FILE_PATH pull"
echo "       $COMPOSE_CMD -f $COMPOSE_FILE_PATH up -d"

echo "[INFO] Pulling pinned images from GHCR..."
$COMPOSE_CMD -f "$COMPOSE_FILE_PATH" pull

echo "[INFO] Starting Flussio stack..."
$COMPOSE_CMD -f "$COMPOSE_FILE_PATH" up -d

echo "[INFO] Done. Run: $COMPOSE_CMD -f $COMPOSE_FILE_PATH ps"
