BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS modules_version BIGINT NOT NULL DEFAULT 0 CHECK (modules_version >= 0);

CREATE TABLE IF NOT EXISTS company_modules (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_code TEXT NOT NULL CHECK (module_code IN ('jobs','real_estate','wealth','investments','market_data','crypto_sync','api_excel')),
  state TEXT NOT NULL CHECK (state IN ('enabled','read_only','disabled')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, module_code)
);

-- Audit identifiers deliberately have no cascading FK: deleting a company/user must
-- not erase or rewrite the historical event. No credentials or entity data are stored.
CREATE TABLE IF NOT EXISTS company_module_events (
  id BIGSERIAL PRIMARY KEY,
  operation_id UUID NOT NULL,
  company_id INTEGER NOT NULL,
  module_code TEXT NOT NULL CHECK (module_code IN ('jobs','real_estate','wealth','investments','market_data','crypto_sync','api_excel')),
  previous_state TEXT CHECK (previous_state IN ('enabled','read_only','disabled')),
  new_state TEXT NOT NULL CHECK (new_state IN ('enabled','read_only','disabled')),
  actor_user_id INTEGER,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  company_version BIGINT NOT NULL CHECK (company_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operation_id, module_code)
);
CREATE INDEX IF NOT EXISTS company_module_events_company_id_idx ON company_module_events(company_id, id DESC);

CREATE OR REPLACE FUNCTION provision_legacy_company_modules(target_company INTEGER) RETURNS VOID AS $$
DECLARE
  operation UUID := gen_random_uuid();
  next_version BIGINT;
BEGIN
  -- Used only during the preparatory M1 phase, before end-to-end enforcement.
  SELECT modules_version + 1 INTO next_version FROM companies WHERE id = target_company FOR UPDATE;
  WITH inserted AS (
    INSERT INTO company_modules(company_id, module_code, state)
    VALUES (target_company, 'jobs', 'enabled'), (target_company, 'real_estate', 'enabled')
    ON CONFLICT DO NOTHING
    RETURNING module_code
  )
  INSERT INTO company_module_events(operation_id, company_id, module_code, previous_state, new_state, reason, company_version)
  SELECT operation, target_company, module_code, NULL, 'enabled', 'legacy_compatibility', next_version FROM inserted;
  IF FOUND THEN
    UPDATE companies SET modules_version = next_version WHERE id = target_company;
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT provision_legacy_company_modules(id) FROM companies ORDER BY id;

CREATE OR REPLACE FUNCTION provision_legacy_company_modules_on_insert() RETURNS TRIGGER AS $$
BEGIN
  PERFORM provision_legacy_company_modules(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS companies_provision_legacy_modules ON companies;
CREATE TRIGGER companies_provision_legacy_modules AFTER INSERT ON companies
FOR EACH ROW EXECUTE FUNCTION provision_legacy_company_modules_on_insert();

CREATE OR REPLACE FUNCTION protect_company_module_events() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Company module events are append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS company_module_events_immutable ON company_module_events;
CREATE TRIGGER company_module_events_immutable BEFORE UPDATE OR DELETE ON company_module_events
FOR EACH ROW EXECUTE FUNCTION protect_company_module_events();
DROP TRIGGER IF EXISTS company_module_events_no_truncate ON company_module_events;
CREATE TRIGGER company_module_events_no_truncate BEFORE TRUNCATE ON company_module_events
FOR EACH STATEMENT EXECUTE FUNCTION protect_company_module_events();
COMMIT;
