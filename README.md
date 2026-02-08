# Flussio

Flussio is a lightweight accounting web app for tracking income, expenses, transfers, and a full registry of master data (accounts, categories, contacts, properties). This repository contains the Phase 1 MVP with a React + Vite frontend, a Node.js + Express backend, and PostgreSQL 16.

## Quickstart (Docker)

```bash
docker compose up -d
```

The services will be available at:
- Frontend: http://localhost:8080
- Backend API: http://localhost:4000
- PostgreSQL: localhost:5432 (only when using the dev override)

> Tip: `docker-compose.override.yml` exposes Postgres on 5432 for local development. Remove or ignore the override file in production.

## Environment configuration

Create `.env` files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Adjust the values if needed (ports, database URL, JWT secret).

## Health checks

- Via frontend reverse proxy: http://localhost:8080/api/health
- Direct backend: http://localhost:4000/health

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

## Deploy su QNAP Container Station

### Metodo 1 (consigliato): caricare il file Compose dal NAS
1. Copia la repo su NAS, ad esempio: `/share/CACHEDEV1_DATA/Container/flussio`.
2. Crea i file `.env` partendo dagli example:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
3. Apri **Container Station** → **Create Application**.
4. Seleziona **Carica file** e scegli `docker-compose.yml` direttamente dalla cartella sul NAS.
5. Avvia l'applicazione. Porte default: frontend **8080**, backend **4000**.

> Nota: evita di incollare il YAML direttamente nell'editor QNAP se usi `env_file`, perché QNAP salva in `/tmp` e i path relativi falliscono.

### Metodo 2: incollare docker-compose.qnap.yml
Se vuoi incollare il YAML nell'editor QNAP, usa `docker-compose.qnap.yml` che non dipende da `env_file`.

1. Apri **Container Station** → **Create Application** → **Incolla YAML**.
2. Incolla il contenuto di `docker-compose.qnap.yml`.
3. (Opzionale) Personalizza le variabili nel pannello **Environment**:
   - `FLUSSIO_ROOT` (default: `/share/CACHEDEV1_DATA/Container/flussio`)
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
   - `DATABASE_URL`, `JWT_SECRET`
   - `VITE_API_BASE` (default: `/api`)
   - `DEV_USER_EMAIL`, `DEV_USER_PASSWORD` (seed utente dev)
4. Avvia l'applicazione. Porte default: frontend **8080**, backend **4000**.

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

## Docker Quickstart notes (Windows/Docker Desktop)

- Apri http://localhost:8080 e usa `dev@flussio.local` / `flussio123`.
- Non usare http://localhost:4000 nel browser per verificare il login: usa `/health` o `/api/health`.
