#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="$ROOT_DIR/deploy/production"
DOCS_DIR="$PROD_DIR/docs"

required_files=(
  "$PROD_DIR/docker-compose.prod.yml"
  "$PROD_DIR/docker-compose.prod.qnap.yml"
  "$PROD_DIR/install.sh"
  "$PROD_DIR/backup.sh"
  "$PROD_DIR/check-schema.sh"
  "$PROD_DIR/restore-test.sh"
  "$PROD_DIR/.env.example.prod"
  "$DOCS_DIR/PRODUCTION_INSTALL.md"
  "$DOCS_DIR/GO_LIVE_CHECKLIST.md"
  "$DOCS_DIR/BACKUP_AND_RESTORE.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "[ERROR] Missing required production file: $file"
    exit 1
  fi

  line_count="$(wc -l < "$file")"
  if (( line_count < 2 )); then
    echo "[ERROR] File appears malformed (single line): $file"
    exit 1
  fi

  if rg -q '\\n' "$file"; then
    echo "[ERROR] File appears to contain escaped newlines (\\n): $file"
    exit 1
  fi
done

echo "[INFO] Required files are multiline and present."

docker compose -f "$PROD_DIR/docker-compose.prod.yml" config >/dev/null
docker compose -f "$PROD_DIR/docker-compose.prod.qnap.yml" config >/dev/null
echo "[INFO] Compose files are parseable."

bash -n "$PROD_DIR/install.sh"
bash -n "$PROD_DIR/backup.sh"
bash -n "$PROD_DIR/check-schema.sh"
bash -n "$PROD_DIR/restore-test.sh"
bash -n "$PROD_DIR/generate-secrets.sh"
echo "[INFO] Shell scripts passed syntax validation."
