-- Operational module enforcement: preserve all recorded states and audit.
-- Missing optional rows mean disabled; companies created from now on use Base.
DROP TRIGGER IF EXISTS companies_provision_legacy_modules ON companies;
DROP FUNCTION IF EXISTS provision_legacy_company_modules_on_insert();
DROP FUNCTION IF EXISTS provision_legacy_company_modules(INTEGER);
