# Database (manual migrations)

## Initialization
Docker uses the SQL scripts in `database/init/` the **first time** it creates the Postgres volume.

- `001_schema.sql` creates the schema.
- `002_seed_dev.sql` seeds demo data (DEV only).

## Manual migrations (Approach A)
1. Create a new SQL file inside `database/migrations/` using this naming format:
   - `002_YYYYMMDD__short_description.sql`
2. Apply it manually with a SQL client (psql, DBeaver) against the running database.
3. Record the change in your internal changelog.

### Current migration set
- `002_20260215__opening_balance_and_recalc.sql`
  - Adds `accounts.opening_balance`.
  - Preserves existing values.
  - Recalculates `accounts.balance` from transaction history.

Example (psql):

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20260215__opening_balance_and_recalc.sql
```
