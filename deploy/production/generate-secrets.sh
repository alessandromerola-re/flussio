#!/usr/bin/env bash
set -euo pipefail

echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')"
echo "BOOTSTRAP_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')"
