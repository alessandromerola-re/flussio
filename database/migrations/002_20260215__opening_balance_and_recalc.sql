BEGIN;

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

UPDATE accounts
SET opening_balance = balance
WHERE opening_balance = 0;

UPDATE accounts a
SET balance = a.opening_balance + COALESCE(m.delta, 0)
FROM (
  SELECT
    acc.id AS account_id,
    COALESCE(SUM(CASE WHEN ta.direction = 'in' THEN ta.amount ELSE -ta.amount END), 0) AS delta
  FROM accounts acc
  LEFT JOIN transaction_accounts ta ON ta.account_id = acc.id
  LEFT JOIN transactions t ON t.id = ta.transaction_id AND t.company_id = acc.company_id
  GROUP BY acc.id
) m
WHERE a.id = m.account_id;

COMMIT;
