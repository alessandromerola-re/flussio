# Flussio

Flussio is a lightweight accounting web app for tracking income, expenses, transfers, and a full registry of master data (accounts, categories, contacts, properties). This repository contains the Phase 1 MVP with a React + Vite frontend, a Node.js + Express backend, and PostgreSQL 16.

## Quickstart (Docker)

```bash
docker compose up -d
```

The services will be available at:
- Frontend: http://localhost:8080
- Backend API: http://localhost:4000
- PostgreSQL: localhost:5432

## Environment configuration

Create `.env` files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Adjust the values if needed (ports, database URL, JWT secret).

## Default DEV login (DEV ONLY)

- **Email:** `dev@flussio.local`
- **Password:** `flussio123`

> ⚠️ This user is seeded for local development only.

## Manual migrations (Approach A)

- Init schema/seed runs only on the first database boot (empty volume) from `database/init/`.
- To create incremental changes, add a SQL file to `database/migrations/` in the format:
  - `002_YYYYMMDD__short_description.sql`
- Apply migrations manually using your SQL tool (psql, DBeaver).

Example:

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20241015__add_indexes.sql
```

See `database/README.md` for details.

## Basic QNAP notes (high-level)

- Ensure Docker is enabled on your QNAP NAS (Container Station).
- Map ports 8080 (frontend) and 4000 (backend) to avoid conflicts.
- Use named volumes so PostgreSQL data persists across container restarts.
- For backups, export the PostgreSQL volume or run periodic `pg_dump`.

## Architecture overview

- **Frontend:** React + Vite + i18next (IT/EN), API client, responsive UI.
- **Backend:** Express + pg + JWT auth, REST endpoints for registry, movements, dashboard.
- **Database:** PostgreSQL 16 with manual migrations.

## How to run locally (without Docker)

1. Start Postgres (ensure DB + user exist).
2. Backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Testing

No automated tests are provided yet for Phase 1. Manual smoke testing:
- Login with DEV credentials
- Create accounts/categories/contacts/properties
- Create movements and verify the dashboard KPIs
- Switch language IT/EN from the header
