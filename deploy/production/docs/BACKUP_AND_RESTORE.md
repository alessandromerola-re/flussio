# Backup, restore test and schema checks

## Backup
```bash
./backup.sh
```

## Restore test
```bash
./restore-test.sh ./data/backups/flussio-backup-YYYYMMDD-HHMMSS.sql.gz
```

## Schema check
Run from the bundle root:

```bash
docker compose -f docker-compose.prod.yml cp check_schema.sql db:/work/check_schema.sql
docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /work/check_schema.sql
```
