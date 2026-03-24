BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS expected_revenue_cents BIGINT,
  ADD COLUMN IF NOT EXISTS expected_cost_cents BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_expected_revenue_cents_non_negative'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_expected_revenue_cents_non_negative
      CHECK (expected_revenue_cents IS NULL OR expected_revenue_cents >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_expected_cost_cents_non_negative'
  ) THEN
    ALTER TABLE jobs
      ADD CONSTRAINT jobs_expected_cost_cents_non_negative
      CHECK (expected_cost_cents IS NULL OR expected_cost_cents >= 0);
  END IF;
END $$;

COMMIT;
