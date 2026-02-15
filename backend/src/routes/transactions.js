import express from 'express';
import { getClient, query } from '../db/index.js';

const router = express.Router();

const isValidDirection = (direction) => direction === 'in' || direction === 'out';

const getAccountDelta = (direction, amount) => (direction === 'in' ? amount : -amount);

const lockCompanyAccounts = async (client, companyId, accountIds) => {
  if (accountIds.length === 0) {
    return;
  }

  const accountResult = await client.query(
    `
    SELECT id
    FROM accounts
    WHERE company_id = $1 AND id = ANY($2::int[])
    ORDER BY id
    FOR UPDATE
    `,
    [companyId, accountIds]
  );

  if (accountResult.rowCount !== accountIds.length) {
    const error = new Error('Account not found in company');
    error.status = 400;
    error.error_code = 'VALIDATION_MISSING_FIELDS';
    throw error;
  }
};

const validateTransactionRefs = async (client, companyId, { category_id, contact_id, property_id }) => {
  const checks = [
    { key: 'category_id', value: category_id, table: 'categories' },
    { key: 'contact_id', value: contact_id, table: 'contacts' },
    { key: 'property_id', value: property_id, table: 'properties' },
  ];

  for (const check of checks) {
    if (check.value == null) {
      continue;
    }
    const result = await client.query(
      `SELECT id FROM ${check.table} WHERE id = $1 AND company_id = $2`,
      [check.value, companyId]
    );
    if (result.rowCount === 0) {
      const error = new Error(`Invalid ${check.key}`);
      error.status = 400;
      error.error_code = 'VALIDATION_MISSING_FIELDS';
      throw error;
    }
  }
};

router.get('/', async (req, res) => {
  const filters = buildTransactionsFilters(req.query, req.user.company_id);
  if (filters.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const params = [...filters.params, filters.limit, filters.offset];
    const result = await query(
      `
      SELECT
        t.*, 
        c.name AS category_name,
        ct.name AS contact_name,
        p.name AS property_name,
        COALESCE(
          json_agg(
            json_build_object(
              'account_id', ta.account_id,
              'direction', ta.direction,
              'amount', ta.amount,
              'account_name', a.name
            ) ORDER BY ta.id
          ) FILTER (WHERE ta.id IS NOT NULL),
          '[]'::json
        ) AS accounts
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN contacts ct ON t.contact_id = ct.id
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN transaction_accounts ta ON t.id = ta.transaction_id
      LEFT JOIN accounts a ON ta.account_id = a.id
      WHERE t.company_id = $1
      GROUP BY t.id, c.name, ct.name, p.name
      ORDER BY t.date DESC, t.id DESC
      LIMIT $2
      `,
      [req.user.company_id, limit]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const {
    date,
    type,
    amount_total,
    description = null,
    category_id = null,
    contact_id = null,
    property_id = null,
    accounts = [],
  } = req.body;

  if (!date || !type || amount_total == null || accounts.length === 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  if (!['income', 'expense', 'transfer'].includes(type)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const parsedAccounts = accounts.map((account) => ({
    account_id: Number(account.account_id),
    direction: account.direction,
    amount: Number(account.amount),
  }));

  const hasInvalidAccount = parsedAccounts.some(
    (account) => !Number.isInteger(account.account_id) || !isValidDirection(account.direction) || !(account.amount > 0)
  );
  if (hasInvalidAccount) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const uniqueAccountIds = [...new Set(parsedAccounts.map((account) => account.account_id))].sort((a, b) => a - b);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await validateTransactionRefs(client, req.user.company_id, { category_id, contact_id, property_id });
    await lockCompanyAccounts(client, req.user.company_id, uniqueAccountIds);

    const transactionResult = await client.query(
      `
      INSERT INTO transactions (company_id, date, type, amount_total, description, category_id, contact_id, property_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        req.user.company_id,
        date,
        type,
        amount_total,
        description,
        category_id,
        contact_id,
        property_id,
      ]
    );

    const transaction = transactionResult.rows[0];

    for (const account of parsedAccounts) {
      await client.query(
        `
        INSERT INTO transaction_accounts (transaction_id, account_id, direction, amount)
        VALUES ($1, $2, $3, $4)
        `,
        [transaction.id, account.account_id, account.direction, account.amount]
      );

      await client.query(
        `
        UPDATE accounts
        SET balance = balance + $1
        WHERE id = $2 AND company_id = $3
        `,
        [getAccountDelta(account.direction, account.amount), account.account_id, req.user.company_id]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(transaction);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ error_code: error.error_code });
    }
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const transactionResult = await client.query(
      'SELECT id FROM transactions WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [id, req.user.company_id]
    );
    if (transactionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const entriesResult = await client.query(
      `
      SELECT ta.account_id, ta.direction, ta.amount
      FROM transaction_accounts ta
      JOIN accounts a ON a.id = ta.account_id
      WHERE ta.transaction_id = $1 AND a.company_id = $2
      ORDER BY ta.account_id
      `,
      [id, req.user.company_id]
    );

    const accountIds = [...new Set(entriesResult.rows.map((entry) => entry.account_id))];
    await lockCompanyAccounts(client, req.user.company_id, accountIds);

    await client.query('DELETE FROM transactions WHERE id = $1 AND company_id = $2', [id, req.user.company_id]);

    for (const entry of entriesResult.rows) {
      await client.query(
        `
        UPDATE accounts
        SET balance = balance - $1
        WHERE id = $2 AND company_id = $3
        `,
        [getAccountDelta(entry.direction, Number(entry.amount)), entry.account_id, req.user.company_id]
      );
    }

    await client.query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

export default router;
