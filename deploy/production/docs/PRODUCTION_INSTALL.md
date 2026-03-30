# Flussio Production Install (Linux and QNAP)

> **Official path: Docker Compose first (no wrapper required).**
> `install.sh` is optional convenience only.

## 1) Extract the production bundle

1. Download `flussio-production-bundle-<version>.zip` from GitHub Releases.
2. Extract it and enter the extracted directory.

## 2) Create `.env`

```bash
cp .env.example.prod .env
```

Then edit `.env` and set at minimum:
- `FLUSSIO_VERSION`
- `GHCR_OWNER`
- `GHCR_REPO`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `BOOTSTRAP_ADMIN_*`

Optional helper to generate strong secrets:

```bash
./generate-secrets.sh
```

## 3) Start Flussio with Docker Compose (official)

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Open:

```text
http://<server>:<FRONTEND_HOST_PORT>
```

## QNAP installation

QNAP is treated as a standard Linux Docker Compose host.
Use the same commands and named-volume persistence model.

```bash
docker compose -f docker-compose.prod.qnap.yml pull
docker compose -f docker-compose.prod.qnap.yml up -d
```

## Optional helper script (not required)

```bash
./install.sh
```

`install.sh` executes the same `pull` + `up -d` sequence and can use:

```bash
export FLUSSIO_COMPOSE_FILE=docker-compose.prod.qnap.yml
./install.sh
```

## Where data is stored

The production stack uses **named Docker volumes only**:
- `flussio_db_data` (PostgreSQL data)
- `flussio_uploads` (attachments)
- `flussio_backups` (backup workspace mounted in backend)

Useful checks:

```bash
docker volume ls | grep flussio
docker volume inspect flussio_db_data
```

Health checks:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100
```
