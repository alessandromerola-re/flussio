# Flussio Production Install (Linux / QNAP)

1. Download `flussio-production-bundle-<version>.zip` from GitHub Release.
2. Extract and enter the directory.
3. Copy `.env.example.prod` to `.env` and fill mandatory values.
4. (Optional) Set `FLUSSIO_COMPOSE_FILE=docker-compose.prod.qnap.yml` for QNAP.
5. Run `./install.sh`.
6. Open `http://<server>:<FRONTEND_HOST_PORT>` and login with bootstrap admin credentials.

Recommended command sequence (Linux):

```bash
cp .env.example.prod .env
./generate-secrets.sh
# paste generated values into .env
./install.sh
```

QNAP sequence:

```bash
cp .env.example.prod .env
# set QNAP_* paths
export FLUSSIO_COMPOSE_FILE=docker-compose.prod.qnap.yml
./install.sh
```

No local frontend/backend build is required for production deployment.
