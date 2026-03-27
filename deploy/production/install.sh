#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f ".env" ]]; then
  echo "[ERROR] Missing .env file. Copy .env.example.prod to .env and fill mandatory values."
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

echo "[INFO] Pulling pinned images from GHCR..."
$COMPOSE_CMD -f docker-compose.prod.yml pull

echo "[INFO] Starting Flussio production stack..."
$COMPOSE_CMD -f docker-compose.prod.yml up -d

echo "[INFO] Done. Run: $COMPOSE_CMD -f docker-compose.prod.yml ps"
