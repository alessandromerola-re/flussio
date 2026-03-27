# Backup, restore test and schema checks

Scripts support Linux and QNAP compose variants.

- Default compose file: `docker-compose.prod.yml`
- Override: `FLUSSIO_COMPOSE_FILE=docker-compose.prod.qnap.yml`

## Backup
```bash
./backup.sh
```

## Restore test
```bash
./restore-test.sh ./data/backups/flussio-backup-YYYYMMDD-HHMMSS.sql.gz
```

## Schema check
```bash
./check-schema.sh
```
