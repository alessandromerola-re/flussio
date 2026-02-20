BEGIN;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget NUMERIC(12, 2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE jobs
SET title = COALESCE(title, name)
WHERE title IS NULL;

ALTER TABLE jobs ALTER COLUMN title SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_company_code_unique
  ON jobs(company_id, code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_company_active
  ON jobs(company_id, is_active, is_closed);

CREATE INDEX IF NOT EXISTS idx_transactions_company_job_date
  ON transactions(company_id, job_id, date);

COMMIT;
