# Flussio

Flussio is a lightweight accounting web app (Phase 1 MVP) for managing:
- registry data (accounts, categories, contacts, properties)
- movements (income, expense, transfer)
- dashboard metrics

Stack:
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL 16

## Quickstart (Docker)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d --build
```

Default URLs:
- Frontend: http://localhost:9808
- Backend API: http://localhost:4000

## Frontend host port configuration

The frontend host port is configurable via env var in compose mapping:

```yaml
${FRONTEND_HOST_PORT:-9808}:80
```

Examples:

```bash
# default (9808)
docker compose up -d --build

# custom
FRONTEND_HOST_PORT=9000 docker compose up -d --build
```

You can also set `FRONTEND_HOST_PORT` in root `.env`.

## DEV login (seed)

- Email: `dev@flussio.local`
- Password: `flussio123`

DEV seed stores password as bcrypt hash. Login uses bcrypt verification only.

## Manual migrations (Approach A)

Init SQL runs only on first bootstrap of an empty Postgres volume (`database/init`).
Incremental changes are SQL files in `database/migrations` and must be applied manually.

Apply migrations manually in order (existing installations):

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20260215__opening_balance_and_recalc.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/003_20260215__hash_dev_seed_password.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_jobs_and_transactions_job_id.sql
# optional but recommended if you used properties as jobs in phase 1
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/003_optional_migrate_properties_to_jobs.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/004_20260216__attachments_metadata.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/005_20260216__extend_jobs_and_reports_index.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/006_20260216__recurring_templates_and_runs.sql
```


## Movements filters (API)

`GET /api/transactions` supports these query params:
- `date_from=YYYY-MM-DD`
- `date_to=YYYY-MM-DD`
- `type=income|expense|transfer`
- `account_id=<number>`
- `category_id=<number>`
- `contact_id=<number>`
- `property_id=<number>`
- `job_id=<number>`
- `q=<text search in description>`
- `limit` (default `30`, max `200`)
- `offset` (default `0`, max `5000`)

Examples:

```bash
curl "http://localhost:4000/api/transactions?limit=5"
curl "http://localhost:4000/api/transactions?date_from=2026-01-01&date_to=2026-01-31&type=income"
```

## Movements CSV export

Endpoint:
- `GET /api/transactions/export` (same filters as `/api/transactions`)

Run locally:

```bash
curl -L -H "Authorization: Bearer <TOKEN>"   "http://localhost:4000/api/transactions/export?date_from=2026-01-01&type=expense"   -o flussio_movimenti.csv
```

CSV columns:
`date;type;amount_total;account_names;category;contact;commessa;description`

## Attachments usage

In movement details modal:
- upload attachments (`pdf`, images, doc/docx, xls/xlsx)
- preview images/PDF directly in modal
- download attachments
- delete attachments

Upload size limit: 20MB per file (configurable with `ATTACHMENT_MAX_MB`, default `20`).

If you run frontend behind Nginx, configure `client_max_body_size` (e.g. `20M`) to avoid HTTP 413 before backend validation.

If you run frontend behind Nginx, configure `client_max_body_size` (e.g. `20M`) to avoid HTTP 413 before backend validation.

## Phase 1 smoke test checklist

1. Login with `dev@flussio.local / flussio123`
2. Registry CRUD:
   - accounts
   - categories
   - contacts
   - properties
3. Movements:
   - create income/expense/transfer
   - delete a movement
   - verify account balances are coherent after create/delete
4. Attachments in movement details (if enabled in UI):
   - upload
   - download
   - delete

## CI

GitHub Actions workflow (`.github/workflows/docker-image.yml`) does:
1. backend install + tests
2. frontend install + build
3. build/push multi-arch Docker images:
   - `ghcr.io/<owner>/<repo>-backend`
   - `ghcr.io/<owner>/<repo>-frontend`

## Backend tests

Run locally:

```bash
cd backend
npm ci
DATABASE_URL=postgres://flussio:flussio@localhost:5432/flussio_test JWT_SECRET=test_secret npm test
```

Test coverage includes:
- auth login with bcrypt user
- movement create/delete with balance update/revert checks


## Sprint 1 – Job reports

Apply the migration for extended jobs/report indexes:

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/005_20260216__extend_jobs_and_reports_index.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/006_20260216__recurring_templates_and_runs.sql
```

Report endpoints:

```bash
# Summary JSON
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:4000/api/reports/job/1/summary?date_from=2026-01-01&date_to=2026-12-31"

# CSV export for one job
curl -L -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:4000/api/reports/job/1/export.csv?date_from=2026-01-01&date_to=2026-12-31" \
  -o flussio_job_1.csv
```

Manual verification checklist:
1. Create a job with code, budget, and dates.
2. Create income/expense/transfer movements linked to that job.
3. Open job detail: totals are correct (transfer excluded from margin).
4. Verify category breakdown values.
5. Click "Go to movements": movements page opens with job filter pre-selected.
6. Export job CSV downloads correctly.


## Recurring templates (Phase 2 PR#1)

Environment flags:

```bash
RECURRING_GENERATOR_ENABLED=true
RECURRING_GENERATOR_INTERVAL_MIN=5
```

Scheduling rules (Europe/Rome):
- Monthly generation always runs on day 1 at 00:05.
- If monthly `start_date` is day 1, first run is that date at 00:05.
- Otherwise first monthly run is day 1 of next month at 00:05.

Endpoints:

```bash
# list/create/update/delete templates
GET    /api/recurring-templates
POST   /api/recurring-templates
GET    /api/recurring-templates/:id
PUT    /api/recurring-templates/:id
DELETE /api/recurring-templates/:id

# generate one template now
POST   /api/recurring-templates/:id/generate-now

# generate all due templates
POST   /api/recurring-templates/generate-due
```

Quick curl checks:

```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Canone mensile","frequency":"monthly","interval":1,"amount":850,"movement_type":"income"}' \
  http://localhost:4000/api/recurring-templates

curl -X POST -H "Authorization: Bearer <TOKEN>" \
  http://localhost:4000/api/recurring-templates/1/generate-now

curl -X POST -H "Authorization: Bearer <TOKEN>" \
  http://localhost:4000/api/recurring-templates/generate-due
```

Manual QA checklist:
1. Create a monthly template and generate now.
2. Trigger generate-now twice in same cycle and verify second call is skipped.
3. Verify generated movement has recurring badge in Movements list/detail.
4. Test yearly template with 29/02 anchor and verify fallback to 28/02 in non-leap year.
5. Set end_date in the past and verify template stops generating.


## Roles and audit (Phase 2 PR#2)

Roles supported:
- `admin`
- `editor`
- `operatore`
- `viewer`

Permission model (enforced backend):
- viewer: read only
- operatore: read + write, no sensitive delete, no exports
- editor: read + write + sensitive delete + exports
- admin: all + users management

Audit log:
- table: `audit_log`
- tracks create/update/delete on movements/jobs/recurring_templates/attachments

Migration:

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/007_20260216__roles_audit_and_scaffolding.sql
```

## PR#3 scaffolding

Enabled scaffolding includes:
- Admin users API (`/api/users`)
- Password reset token scaffold (`/api/users/:id/reset-password-token`)
- Roadmap scaffold endpoint (`/api/scaffolding/roadmap`)
- Placeholder DB schema for contracts and reset tokens

Env:

```bash
RESET_EMAIL_ENABLED=false
ATTACHMENT_MAX_MB=20
SHOW_ROADMAP=false
DEV_SCHEMA_AUTO_PATCH=false
VITE_SHOW_ROADMAP=false
```

If `RESET_EMAIL_ENABLED=false`, admin reset endpoint returns token for dev/manual flow.
