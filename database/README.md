# Database (manual migrations)

## Initialization
Docker uses SQL scripts in `database/init/` only on first creation of the Postgres volume:
- `001_schema.sql`
- `002_seed_dev.sql`

## Manual migrations (Approach A)
Add SQL files in `database/migrations/` and apply manually.

Current migrations:
- `002_20260215__opening_balance_and_recalc.sql`
- `003_20260215__hash_dev_seed_password.sql`

### Current migration set
- `002_20260215__opening_balance_and_recalc.sql`
  - Adds `accounts.opening_balance`.
  - Preserves existing values.
  - Recalculates `accounts.balance` from transaction history.

Example (psql):

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20260215__opening_balance_and_recalc.sql
```
