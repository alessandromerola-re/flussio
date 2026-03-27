# Flussio

Flussio is a lightweight accounting web app.

## Local development

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d --build
```

Default URLs:
- Frontend: http://localhost:9808
- Backend: http://localhost:4000

DEV seed is available only when `ENABLE_DEV_SEED=true`.

## Production (download & install bundle)

Production deployment is **image-based** (`ghcr.io/<owner>/<repo>-backend:<tag>` and `ghcr.io/<owner>/<repo>-frontend:<tag>`), no local build required.

1. Open a GitHub Release tag (for example `v1.1.0`).
2. Download `flussio-production-bundle-<version>.zip`.
3. Extract it.
4. Copy `.env.example.prod` to `.env` and set strong secrets.
5. Run `./install.sh`.

Main production files live in `deploy/production/`:
- `docker-compose.prod.yml` (Linux with named volumes)
- `docker-compose.prod.qnap.yml` (QNAP bind mounts)
- `.env.example.prod`
- install/backup/restore/schema-check scripts
- operational docs (`docs/`)

## QNAP

Use `docker-compose.prod.qnap.yml` and set these paths in `.env`:
- `QNAP_DB_PATH`
- `QNAP_UPLOADS_PATH`
- `QNAP_BACKUPS_PATH`

Start command:

```bash
docker compose -f docker-compose.prod.qnap.yml up -d
```

## Migrations and schema updates

Backend runs a deterministic SQL migration runner at startup with a `schema_migrations` tracking table.

- Fresh DB: baseline schema migration is applied automatically.
- Legacy DB (without tracking table): migrations are adopted into `schema_migrations` to keep upgrades controlled.
- New release migrations are applied once and tracked by checksum.

## Bootstrap admin

Set these variables in production `.env`:
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_COMPANY_NAME`

Bootstrap admin is created only if no users exist (idempotent).

## Backup and restore

From production bundle directory:

```bash
./backup.sh
./restore-test.sh ./data/backups/<backup-file>.sql.gz
./check-schema.sh
```

## GitHub Actions and releases

- `.github/workflows/docker-image.yml` runs tests and publishes backend/frontend GHCR images on `main` and release tags.
- `.github/workflows/release-bundle.yml` builds and uploads `flussio-production-bundle-<version>.zip` to the GitHub Release when a `v*` tag is pushed.
