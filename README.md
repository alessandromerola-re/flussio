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
- Frontend: http://localhost:98080
- Backend API: http://localhost:4000

## Frontend host port configuration

The frontend host port is configurable via env var in compose mapping:

```yaml
${FRONTEND_HOST_PORT:-98080}:80
```

Examples:

```bash
# default (98080)
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

Apply Phase 1 migrations:

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20260215__opening_balance_and_recalc.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/003_20260215__hash_dev_seed_password.sql
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
- download attachments
- delete attachments

Upload size limit: 10MB per file.

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
