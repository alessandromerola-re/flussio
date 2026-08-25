# Database migrations

## Initialization
Docker uses SQL scripts in `database/init/` only on first creation of the Postgres volume:
- `001_schema.sql`
- `002_seed_dev.sql`

## Automatic migrations

The backend migration runner is the source of truth. On startup it reads
`backend/migrations/baseline-manifest.json`, acquires a PostgreSQL advisory lock,
checks migration checksums and executes every migration not explicitly folded
into the historical baseline.

Do not edit an applied migration. Add a new, idempotent migration instead.

The files under `database/migrations/` mirror deploy-relevant SQL for operators;
normal application releases use the backend runner.

Manual emergency execution, only after a verified backup:

```bash
psql "$DATABASE_URL" -f database/migrations/011_20260825__recurring_template_account.sql
```
