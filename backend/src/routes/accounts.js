import express from 'express';
import { getClient, query } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';
import { writeAuditLog } from '../services/audit.js';

const router = express.Router();

const allowedTypes = ['cash', 'bank', 'card'];

const parseNumberOrNull = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const reconciliationQuery = `
  SELECT
    a.id,
    a.name,
    a.balance AS stored_balance,
    a.opening_balance + COALESCE(SUM(
      CASE
        WHEN t.id IS NULL THEN 0
        WHEN ta.direction = 'in' THEN ta.amount
        ELSE -ta.amount
      END
    ), 0) AS calculated_balance,
    a.balance - (
      a.opening_balance + COALESCE(SUM(
        CASE
          WHEN t.id IS NULL THEN 0
          WHEN ta.direction = 'in' THEN ta.amount
          ELSE -ta.amount
        END
      ), 0)
    ) AS difference
  FROM accounts a
  LEFT JOIN transaction_accounts ta ON ta.account_id = a.id
  LEFT JOIN transactions t ON t.id = ta.transaction_id AND t.company_id = a.company_id
  WHERE a.company_id = $1
  GROUP BY a.id
  ORDER BY a.name
`;

router.get('/reconciliation', async (req, res) => {
  try {
    const result = await query(reconciliationQuery, [req.companyId]);
    return res.json({
      is_reconciled: result.rows.every((row) => Number(row.difference) === 0),
      accounts: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/reconciliation/apply', requirePermission('reconcile_accounts'), async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM accounts WHERE company_id = $1 ORDER BY id FOR UPDATE', [req.companyId]);
    const beforeResult = await client.query(reconciliationQuery, [req.companyId]);
    await client.query(
      `UPDATE accounts a
       SET balance = a.opening_balance + COALESCE(m.delta, 0)
       FROM (
         SELECT
           acc.id AS account_id,
           COALESCE(SUM(
             CASE
               WHEN t.id IS NULL THEN 0
               WHEN ta.direction = 'in' THEN ta.amount
               ELSE -ta.amount
             END
           ), 0) AS delta
         FROM accounts acc
         LEFT JOIN transaction_accounts ta ON ta.account_id = acc.id
         LEFT JOIN transactions t ON t.id = ta.transaction_id AND t.company_id = acc.company_id
         WHERE acc.company_id = $1
         GROUP BY acc.id
       ) m
       WHERE a.id = m.account_id
         AND a.company_id = $1`,
      [req.companyId]
    );
    await writeAuditLog({
      client,
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'reconcile',
      entityType: 'accounts',
      meta: {
        differences: beforeResult.rows
          .filter((row) => Number(row.difference) !== 0)
          .map((row) => ({ account_id: row.id, difference: row.difference })),
      },
    });
    const afterResult = await client.query(reconciliationQuery, [req.companyId]);
    await client.query('COMMIT');
    return res.json({ is_reconciled: true, accounts: afterResult.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, type, opening_balance, balance, is_active FROM accounts WHERE company_id = $1 ORDER BY name',
      [req.companyId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const { name, type, opening_balance = 0, is_active = true } = req.body;
  const parsedOpeningBalance = parseNumberOrNull(opening_balance);
  if (!name || !type || !allowedTypes.includes(type) || parsedOpeningBalance == null || typeof is_active !== 'boolean') {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(
      `
      INSERT INTO accounts (company_id, name, type, opening_balance, balance, is_active)
      VALUES ($1, $2, $3, $4, $4, $5)
      RETURNING *
      `,
      [req.companyId, name.trim(), type, parsedOpeningBalance, is_active]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, type, opening_balance, is_active } = req.body;
  const { id } = req.params;
  const parsedOpeningBalance = parseNumberOrNull(opening_balance);
  if (!name || !type || !allowedTypes.includes(type) || parsedOpeningBalance == null || typeof is_active !== 'boolean') {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      `
      WITH updated AS (
        UPDATE accounts
        SET
          name = $1,
          type = $2,
          opening_balance = $3,
          balance = balance + ($3 - opening_balance),
          is_active = $4
        WHERE id = $5 AND company_id = $6
        RETURNING *
      )
      SELECT * FROM updated
      `,
      [name.trim(), type, parsedOpeningBalance, is_active, id, req.companyId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const accountResult = await client.query(
      'SELECT id FROM accounts WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [id, req.companyId]
    );
    if (accountResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const usageResult = await client.query(
      `SELECT 1
       FROM transaction_accounts ta
       JOIN transactions t ON t.id = ta.transaction_id
       WHERE ta.account_id = $1
         AND t.company_id = $2
       LIMIT 1`,
      [id, req.companyId]
    );
    if (usageResult.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error_code: 'ACCOUNT_HAS_MOVEMENTS' });
    }

    await client.query(
      `UPDATE recurring_templates
       SET is_active = false,
           updated_at = NOW()
       WHERE account_id = $1
         AND company_id = $2`,
      [id, req.companyId]
    );
    await client.query('DELETE FROM accounts WHERE id = $1 AND company_id = $2', [id, req.companyId]);
    await client.query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

export default router;
