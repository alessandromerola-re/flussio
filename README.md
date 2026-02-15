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

## Default DEV login (DEV ONLY)

## Manual migrations (Approach A)

## Phase 1 smoke test checklist

1. Login with `dev@flussio.local / flussio123`.
2. Open **Anagrafiche** and verify CRUD on:
   - Conti
   - Categorie
   - Contatti
   - Immobili/Progetti
3. Open **Movimenti** and create:
   - Entrata
   - Uscita
   - Giroconto
4. Open movement details and verify attachments:
   - upload
   - download
   - delete
5. Verify account balances update after movement create/delete and are reflected in dashboard widgets.

Apply Phase 1 migrations:

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20260215__opening_balance_and_recalc.sql
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/003_20260215__hash_dev_seed_password.sql
```

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

- Init schema/seed runs only on the first database boot (empty volume) from `database/init/`.
- Incremental changes are SQL files in `database/migrations/`.

Apply migration `002_20260215__opening_balance_and_recalc.sql`:

```bash
psql "postgres://flussio:flussio@localhost:5432/flussio" -f database/migrations/002_20260215__opening_balance_and_recalc.sql
```

What migration 002 does:
- adds `accounts.opening_balance`
- copies old `balance` values into `opening_balance`
- recalculates `accounts.balance` from `opening_balance + movements delta`

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

## CI / Docker images

GitHub Actions now:
- runs backend integration tests (with PostgreSQL service)
- builds frontend bundle
- builds/pushes two multi-arch images:
  - `ghcr.io/<owner>/<repo>-backend`
  - `ghcr.io/<owner>/<repo>-frontend`

## Local tests

```bash
cd frontend && npm run build
cd backend && JWT_SECRET=test DATABASE_URL=postgres://flussio:flussio@localhost:5432/flussio_test npm test
```
