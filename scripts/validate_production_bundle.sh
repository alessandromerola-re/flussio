#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="$ROOT_DIR/deploy/production"
DOCS_DIR="$PROD_DIR/docs"

bundle_files=(
  "$PROD_DIR/docker-compose.prod.yml"
  "$PROD_DIR/docker-compose.prod.qnap.yml"
  "$PROD_DIR/install.sh"
  "$PROD_DIR/backup.sh"
  "$PROD_DIR/check-schema.sh"
  "$PROD_DIR/restore-test.sh"
  "$PROD_DIR/.env.example.prod"
)

essential_files=("${bundle_files[@]}" "$ROOT_DIR/scripts/validate_production_bundle.sh")

doc_files=(
  "$DOCS_DIR/PRODUCTION_INSTALL.md"
  "$DOCS_DIR/GO_LIVE_CHECKLIST.md"
  "$DOCS_DIR/BACKUP_AND_RESTORE.md"
)

required_files=("${essential_files[@]}" "${doc_files[@]}")

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "[ERROR] Missing required production file: $file"
    exit 1
  fi

done

# Hard minimum line counts to catch quasi-monoriga regressions.
declare -A min_lines=(
  ["$PROD_DIR/docker-compose.prod.yml"]=20
  ["$PROD_DIR/docker-compose.prod.qnap.yml"]=20
  ["$PROD_DIR/.env.example.prod"]=10
  ["$ROOT_DIR/scripts/validate_production_bundle.sh"]=15
)

for file in "${!min_lines[@]}"; do
  line_count="$(wc -l < "$file")"
  if (( line_count < min_lines[$file] )); then
    echo "[ERROR] File has unexpectedly few lines ($line_count < ${min_lines[$file]}): $file"
    exit 1
  fi

done

for file in "${bundle_files[@]}"; do
  line_count="$(wc -l < "$file")"
  if (( line_count < 2 )); then
    echo "[ERROR] File appears malformed (single line): $file"
    exit 1
  fi

  if rg -q '\\n' "$file"; then
    echo "[ERROR] File appears to contain escaped newlines (\\n): $file"
    exit 1
  fi

  if grep -q $'\r' "$file"; then
    echo "[ERROR] File contains CRLF line endings; LF is required: $file"
    exit 1
  fi

  max_line_len="$(awk '{ if (length > max) max = length } END { print max + 0 }' "$file")"
  if (( max_line_len > 400 )); then
    echo "[ERROR] File has unexpectedly long line ($max_line_len chars > 400): $file"
    exit 1
  fi

done

echo "[INFO] Required files are present, multiline, LF-only, and not overlong."

docker compose -f "$PROD_DIR/docker-compose.prod.yml" config >/dev/null
docker compose -f "$PROD_DIR/docker-compose.prod.qnap.yml" config >/dev/null
echo "[INFO] Compose files are parseable."

bash -n "$PROD_DIR/install.sh"
bash -n "$PROD_DIR/backup.sh"
bash -n "$PROD_DIR/check-schema.sh"
bash -n "$PROD_DIR/restore-test.sh"
bash -n "$PROD_DIR/generate-secrets.sh"
echo "[INFO] Shell scripts passed syntax validation."
