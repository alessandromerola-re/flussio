DO $$
DECLARE
  missing_tables TEXT[];
  missing_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(expected.name ORDER BY expected.name)
  INTO missing_tables
  FROM (
    VALUES
      ('accounts'),
      ('attachments'),
      ('audit_log'),
      ('categories'),
      ('companies'),
      ('contacts'),
      ('contracts'),
      ('jobs'),
      ('password_reset_tokens'),
      ('properties'),
      ('recurring_runs'),
      ('recurring_templates'),
      ('saved_reports'),
      ('schema_migrations'),
      ('transaction_accounts'),
      ('transactions'),
      ('user_companies'),
      ('users')
  ) AS expected(name)
  WHERE to_regclass('public.' || expected.name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required tables: %', array_to_string(missing_tables, ', ');
  END IF;

  SELECT ARRAY_AGG(expected.table_name || '.' || expected.column_name ORDER BY expected.table_name, expected.column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('accounts', 'opening_balance'),
      ('attachments', 'original_name'),
      ('attachments', 'storage_path'),
      ('jobs', 'code'),
      ('jobs', 'expected_cost_cents'),
      ('jobs', 'expected_revenue_cents'),
      ('jobs', 'title'),
      ('recurring_templates', 'account_id'),
      ('transactions', 'job_id'),
      ('transactions', 'recurring_template_id'),
      ('users', 'is_active'),
      ('users', 'is_super_admin'),
      ('users', 'role')
  ) AS expected(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = expected.table_name
      AND actual.column_name = expected.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Missing required columns: %', array_to_string(missing_columns, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE filename = '011_20260825__recurring_template_account.sql'
  ) THEN
    RAISE EXCEPTION 'Latest required migration is not recorded: 011_20260825__recurring_template_account.sql';
  END IF;
END $$;

SELECT 'accounts' AS table_name, COUNT(*) AS rows FROM accounts
UNION ALL SELECT 'attachments', COUNT(*) FROM attachments
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'companies', COUNT(*) FROM companies
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'properties', COUNT(*) FROM properties
UNION ALL SELECT 'saved_reports', COUNT(*) FROM saved_reports
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'user_companies', COUNT(*) FROM user_companies
UNION ALL SELECT 'users', COUNT(*) FROM users
ORDER BY table_name;

SELECT filename, executed_at, note
FROM schema_migrations
ORDER BY filename;
