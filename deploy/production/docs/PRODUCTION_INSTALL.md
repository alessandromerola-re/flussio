# Flussio Production Install (Linux)

1. Download `flussio-production-bundle-<version>.zip` from GitHub Release.
2. Extract and enter the directory.
3. Copy `.env.example.prod` to `.env` and fill mandatory values.
4. Run `./install.sh`.
5. Open `http://<server>:<FRONTEND_HOST_PORT>` and login with bootstrap admin credentials.

Recommended command sequence:

```bash
cp .env.example.prod .env
./generate-secrets.sh
# paste generated values into .env
./install.sh
```

No local frontend/backend build is required for production deployment.
