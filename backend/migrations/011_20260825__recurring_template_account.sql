BEGIN;

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_templates_account
  ON recurring_templates(company_id, account_id);

UPDATE recurring_templates
SET is_active = false,
    updated_at = NOW()
WHERE account_id IS NULL
  AND is_active = true;

COMMIT;
