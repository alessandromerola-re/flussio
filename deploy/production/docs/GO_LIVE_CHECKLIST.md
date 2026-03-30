# Go-live checklist (day-1 scope)

## Pre go-live
- [ ] DNS and TLS configured for frontend URL.
- [ ] `.env` contains strong secrets and explicit `CORS_ORIGINS`.
- [ ] `BOOTSTRAP_ADMIN_*` configured.
- [ ] Compose file selected (`docker-compose.prod.yml` or `.qnap.yml`).
- [ ] Team knows Flussio data is persisted in named volumes:
  - `flussio_db_data`
  - `flussio_uploads`
  - `flussio_backups`

## First start (official flow)
- [ ] `docker compose -f docker-compose.prod.yml pull`
- [ ] `docker compose -f docker-compose.prod.yml up -d`
- [ ] `docker compose -f docker-compose.prod.yml ps` shows healthy services.
- [ ] Bootstrap admin login works.

## QNAP first start
- [ ] `docker compose -f docker-compose.prod.qnap.yml pull`
- [ ] `docker compose -f docker-compose.prod.qnap.yml up -d`
- [ ] `docker compose -f docker-compose.prod.qnap.yml ps` shows healthy services.

## Core smoke test (initial perimeter)
- [ ] Accounts CRUD
- [ ] Categories CRUD
- [ ] Contacts CRUD
- [ ] Jobs/commesse CRUD
- [ ] Movements create/list/delete
- [ ] Attachment upload/download/delete

## Operations
- [ ] `docker volume ls | grep flussio` returns project volumes.
- [ ] `docker volume inspect flussio_db_data` works.
- [ ] Backup command executed and output file verified.
- [ ] Restore test completed successfully.
- [ ] Schema check completed.

## Optional scripts
- [ ] `./install.sh` (optional helper)
- [ ] `./backup.sh` (optional helper)
- [ ] `./restore-test.sh <backup-file>` (optional helper)
- [ ] `./check-schema.sh` (optional helper)
