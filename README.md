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

### Linux vs QNAP compose

Scripts default to Linux compose:
- `docker-compose.prod.yml`

To use QNAP variant:

```bash
export FLUSSIO_COMPOSE_FILE=docker-compose.prod.qnap.yml
./install.sh
./backup.sh
./restore-test.sh <backup.sql.gz>
./check-schema.sh
```

Main production files live in `deploy/production/`:
- `docker-compose.prod.yml` (Linux with named volumes)
- `docker-compose.prod.qnap.yml` (QNAP bind mounts)
- `.env.example.prod`
- install/backup/restore/schema-check scripts
- operational docs (`docs/`)

## Migrations and schema updates

Backend runs a deterministic SQL migration runner at startup with a `schema_migrations` tracking table.

- Fresh DB: baseline schema migration is applied automatically.
- Legacy DB without tracking table: adoption is allowed only after schema completeness checks (tables + required columns).
- Incomplete legacy schema: backend startup fails with explicit error (no unsafe auto-adoption).
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

- `.github/workflows/docker-image.yml` runs CI for PR/main and publishes GHCR images on `main`.
- `.github/workflows/release-bundle.yml` (on `v*` tag) runs tests, publishes GHCR tag images, then generates and uploads `flussio-production-bundle-<version>.zip`.

## Branding icons (favicon + app icons)

- Admin Settings now supports a dedicated **Favicon & App Icons** section in addition to Logo management.
- Supported upload formats for custom icons: `PNG` and `ICO`.
- Variants are resolved automatically from the uploaded source and served through backend branding endpoints:
  - `favicon`
  - `apple-touch-icon` (enabled when source is PNG with at least `180x180`)
  - `192x192` and `512x512` real files only when source PNG is large enough, otherwise explicit logical fallback
- No binary default assets are tracked in Git by design. When no custom icon exists, frontend falls back to an inlined SVG data URL (text-only).
- Public bootstrap before login is supported through read-only endpoints:
  - `GET /api/public/branding`
  - `GET /api/public/branding/icons/:variant`
  - `GET /api/public/branding/manifest.webmanifest`
- The login page/public entrypoint applies branding icons from these public endpoints (no user token required, no sensitive data exposed).
- `manifest.webmanifest` is intentionally minimal and references 192/512 icons only when those real variants exist.

### Optional manual binary assets (not included in this repository)

If you later want static binary defaults in deployment (outside this PR), add them manually for your environment only:

- `frontend/public/favicon.ico` (`32x32` and/or multi-size ICO)
- `frontend/public/apple-touch-icon.png` (`180x180`)
- `frontend/public/icon-192.png` (`192x192`)
- `frontend/public/icon-512.png` (`512x512`)

These files are intentionally not committed here to keep Codex/Web updates compatible with text-only PR constraints.
