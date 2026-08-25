BEGIN;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  remember BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
  ON auth_sessions(expires_at);

COMMIT;
