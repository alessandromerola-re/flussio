# Go-live checklist (day-1 scope)

## Pre go-live
- [ ] DNS and TLS configured for frontend URL.
- [ ] `.env` contains strong secrets and explicit `CORS_ORIGINS`.
- [ ] `BOOTSTRAP_ADMIN_*` configured.
- [ ] Backup path is writable.

## First start
- [ ] `docker compose -f docker-compose.prod.yml up -d` executed.
- [ ] `docker compose -f docker-compose.prod.yml ps` all services healthy.
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
- [ ] Run schema check (see BACKUP_AND_RESTORE.md).
