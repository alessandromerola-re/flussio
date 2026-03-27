BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE recurring_templates ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_company_external_id ON accounts(company_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_company_external_id ON categories(company_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_external_id ON contacts(company_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_company_external_id ON properties(company_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_templates_company_external_id ON recurring_templates(company_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_company_external_id ON transactions(company_id, external_id) WHERE external_id IS NOT NULL;

COMMIT;
