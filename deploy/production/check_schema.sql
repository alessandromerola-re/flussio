SELECT 'companies' AS table_name, COUNT(*) AS rows FROM companies
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'attachments', COUNT(*) FROM attachments
ORDER BY table_name;

SELECT filename, executed_at, note
FROM schema_migrations
ORDER BY filename;
