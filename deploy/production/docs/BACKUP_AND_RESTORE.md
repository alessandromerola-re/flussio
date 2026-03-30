# Backup, restore test and schema checks

Scripts are optional helpers.
All operations can be executed directly with Docker Compose.

- Default compose file: `docker-compose.prod.yml`
- QNAP variant: `docker-compose.prod.qnap.yml`

## Backup (official direct command)

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip -9' \
  > ./flussio-backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

Optional helper:

```bash
./backup.sh
# or
./backup.sh ./backups/my-backup.sql.gz
```

## Restore test (official direct command)

```bash
BACKUP_FILE=./flussio-backup-YYYYMMDD-HHMMSS.sql.gz

docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'createdb -U "$POSTGRES_USER" flussio_restore_test || true'

gzip -dc "$BACKUP_FILE" | docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'psql -U "$POSTGRES_USER" -d flussio_restore_test'

docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'psql -U "$POSTGRES_USER" -d flussio_restore_test -c "SELECT COUNT(*) AS users FROM users;"'

docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'dropdb -U "$POSTGRES_USER" flussio_restore_test'
```

Optional helper:

```bash
./restore-test.sh ./flussio-backup-YYYYMMDD-HHMMSS.sql.gz
```

## Schema checks

```bash
docker compose -f docker-compose.prod.yml cp check_schema.sql db:/work/check_schema.sql
docker compose -f docker-compose.prod.yml exec -T db \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /work/check_schema.sql'
```

Optional helper:

```bash
./check-schema.sh
```

## Volumes quick reference

```bash
docker volume ls | grep flussio
docker volume inspect flussio_db_data
docker volume inspect flussio_uploads
docker volume inspect flussio_backups
```
