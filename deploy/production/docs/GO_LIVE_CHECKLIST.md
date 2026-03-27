# Go-live checklist (day-1 scope)

## Pre go-live
- [ ] DNS and TLS configured for frontend URL.
- [ ] `.env` contains strong secrets and explicit `CORS_ORIGINS`.
- [ ] `BOOTSTRAP_ADMIN_*` configured.
- [ ] Backup path is writable.
- [ ] `FLUSSIO_COMPOSE_FILE` selected if QNAP variant is used.

## First start
- [ ] `./install.sh` executed successfully.
- [ ] `docker compose -f <selected-compose-file> ps` all services healthy.
- [ ] Bootstrap admin login works.

## Core smoke test (initial perimeter)
- [ ] Accounts CRUD
- [ ] Categories CRUD
- [ ] Contacts CRUD
- [ ] Jobs/commesse CRUD
- [ ] Movements create/list/delete
- [ ] Attachment upload/download/delete

## Operations
- [ ] Run `./backup.sh` and verify output file.
- [ ] Run `./restore-test.sh <backup-file>` successfully.
- [ ] Run `./check-schema.sh`.
