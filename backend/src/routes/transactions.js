import express from 'express';
import { getClient, query } from '../db/index.js';

const router = express.Router();

const isValidDirection = (direction) => direction === 'in' || direction === 'out';
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const getAccountDelta = (direction, amount) => (direction === 'in' ? amount : -amount);

const parseInteger = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
};

const parseLimit = (value, fallback, max) => {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    return null;
  }
  return parsed;
};

const buildTransactionsFilters = (filters = {}, companyId, options = {}) => {
  const maxLimit = options.maxLimit ?? 200;
  const defaultLimit = options.defaultLimit ?? 30;
  const maxOffset = options.maxOffset ?? 5000;

  const where = ['t.company_id = $1'];
  const params = [companyId];

  if (filters.date_from) {
    if (!isoDateRegex.test(filters.date_from)) {
      return { error: true };
    }
    params.push(filters.date_from);
    where.push(`t.date >= $${params.length}`);
  }

  if (filters.date_to) {
    if (!isoDateRegex.test(filters.date_to)) {
      return { error: true };
    }
    params.push(filters.date_to);
    where.push(`t.date <= $${params.length}`);
  }

  if (filters.type) {
    if (!['income', 'expense', 'transfer'].includes(filters.type)) {
      return { error: true };
    }
    params.push(filters.type);
    where.push(`t.type = $${params.length}`);
  }

  const accountId = parseInteger(filters.account_id);
  if (filters.account_id != null && filters.account_id !== '' && accountId == null) {
    return { error: true };
  }
  if (accountId != null) {
    params.push(accountId);
    where.push(
      `EXISTS (SELECT 1 FROM transaction_accounts ta2 WHERE ta2.transaction_id = t.id AND ta2.account_id = $${params.length})`
    );
  }

  const categoryId = parseInteger(filters.category_id);
  if (filters.category_id != null && filters.category_id !== '' && categoryId == null) {
    return { error: true };
  }
  if (categoryId != null) {
    params.push(categoryId);
    where.push(`t.category_id = $${params.length}`);
  }

  const contactId = parseInteger(filters.contact_id);
  if (filters.contact_id != null && filters.contact_id !== '' && contactId == null) {
    return { error: true };
  }
  if (contactId != null) {
    params.push(contactId);
    where.push(`t.contact_id = $${params.length}`);
  }

  const propertyId = parseInteger(filters.property_id);
  if (filters.property_id != null && filters.property_id !== '' && propertyId == null) {
    return { error: true };
  }
  if (propertyId != null) {
    params.push(propertyId);
    where.push(`t.property_id = $${params.length}`);
  }

  const jobId = parseInteger(filters.job_id);
  if (filters.job_id != null && filters.job_id !== '' && jobId == null) {
    return { error: true };
  }
  if (jobId != null) {
    params.push(jobId);
    where.push(`t.job_id = $${params.length}`);
  }

  if (filters.q != null && filters.q !== '') {
    if (typeof filters.q !== 'string') {
      return { error: true };
    }
    params.push(`%${filters.q.trim()}%`);
    where.push(`COALESCE(t.description, '') ILIKE $${params.length}`);
  }

  const limit = parseLimit(filters.limit, defaultLimit, maxLimit);
  if (limit == null) {
    return { error: true };
  }

  const offset = parseLimit(filters.offset, 0, maxOffset);
  if (offset == null) {
    return { error: true };
  }

  return {
    whereSql: where.join(' AND '),
    params,
    limit,
    offset,
  };
};

const getTransactionsQuery = ({ whereSql, includePagination = true, limitParamIndex, offsetParamIndex }) => `
  SELECT
    t.*, 
    c.name AS category_name,
    ct.name AS contact_name,
    p.name AS property_name,
    j.name AS job_name,
    rt.title AS recurring_template_title,
    (
      SELECT COUNT(*)::int
      FROM attachments att
      WHERE att.transaction_id = t.id
    ) AS attachment_count,
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
  LEFT JOIN jobs j ON t.job_id = j.id
  LEFT JOIN recurring_templates rt ON t.recurring_template_id = rt.id
  LEFT JOIN transaction_accounts ta ON t.id = ta.transaction_id
  LEFT JOIN accounts a ON ta.account_id = a.id
  WHERE ${whereSql}
  GROUP BY t.id, c.name, ct.name, p.name, j.name, rt.title
  ORDER BY t.date DESC, t.id DESC
  ${includePagination ? `LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}` : ''}
`;

const csvEscape = (value) => {
  const stringValue = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

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

const validateTransactionRefs = async (client, companyId, { category_id, contact_id, property_id, job_id }) => {
  const checks = [
    { key: 'category_id', value: category_id, table: 'categories' },
    { key: 'contact_id', value: contact_id, table: 'contacts' },
    { key: 'property_id', value: property_id, table: 'properties' },
    { key: 'job_id', value: job_id, table: 'jobs' },
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

router.get('/export', async (req, res) => {
  const filters = buildTransactionsFilters(req.query, req.user.company_id, {
    defaultLimit: 5000,
    maxLimit: 5000,
  });

  if (filters.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const params = [...filters.params, filters.limit, 0];
    const result = await query(
      getTransactionsQuery({
        whereSql: filters.whereSql,
        includePagination: true,
        limitParamIndex: params.length - 1,
        offsetParamIndex: params.length,
      }),
      params
    );

    const header =
      'date;type;amount_total;account_names;category;contact;commessa;description';
    const rows = result.rows.map((movement) => {
      const accountNames = (movement.accounts || [])
        .map((account) => account?.account_name)
        .filter(Boolean)
        .join(' → ');

      return [
        csvEscape(movement.date),
        csvEscape(movement.type),
        csvEscape(movement.amount_total),
        csvEscape(accountNames),
        csvEscape(movement.category_name),
        csvEscape(movement.contact_name),
        csvEscape(movement.job_name),
        csvEscape(movement.description),
      ].join(';');
    });

    const csv = `${header}\n${rows.join('\n')}`;
    const datePart = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flussio_movimenti_${datePart}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.get('/', async (req, res) => {
  const filters = buildTransactionsFilters(req.query, req.user.company_id);
  if (filters.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const params = [...filters.params, filters.limit, filters.offset];
    const result = await query(
      getTransactionsQuery({
        whereSql: filters.whereSql,
        includePagination: true,
        limitParamIndex: params.length - 1,
        offsetParamIndex: params.length,
      }),
      params
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
    job_id = null,
    accounts = [],
  } = req.body;

  if (!date || !type || amount_total == null || accounts.length === 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  if (!['income', 'expense', 'transfer'].includes(type)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const parsedAmountTotal = Number(amount_total);
  if (!Number.isFinite(parsedAmountTotal) || parsedAmountTotal <= 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const normalizedAmountTotal = type === 'expense'
    ? -Math.abs(parsedAmountTotal)
    : Math.abs(parsedAmountTotal);

  const parsedAccounts = accounts.map((account) => ({
    account_id: Number(account.account_id),
    direction: account.direction,
    amount: Number(account.amount),
  }));

  const hasInvalidAccount = parsedAccounts.some(
    (account) =>
      !Number.isInteger(account.account_id) ||
      !isValidDirection(account.direction) ||
      !(account.amount > 0)
  );
  if (hasInvalidAccount) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const uniqueAccountIds = [...new Set(parsedAccounts.map((account) => account.account_id))].sort(
    (a, b) => a - b
  );

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await validateTransactionRefs(client, req.user.company_id, {
      category_id,
      contact_id,
      property_id,
      job_id,
    });
    await lockCompanyAccounts(client, req.user.company_id, uniqueAccountIds);

    const transactionResult = await client.query(
      `
      INSERT INTO transactions (company_id, date, type, amount_total, description, category_id, contact_id, property_id, job_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        req.user.company_id,
        date,
        type,
        normalizedAmountTotal,
        description,
        category_id,
        contact_id,
        property_id,
        job_id,
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


router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    date,
    type,
    amount_total,
    description = null,
    category_id = null,
    contact_id = null,
    property_id = null,
    job_id = null,
    accounts = [],
  } = req.body;

  if (!date || !type || amount_total == null || accounts.length === 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  if (!['income', 'expense', 'transfer'].includes(type)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const parsedAmountTotal = Number(amount_total);
  if (!Number.isFinite(parsedAmountTotal) || parsedAmountTotal <= 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const normalizedAmountTotal = type === 'expense'
    ? -Math.abs(parsedAmountTotal)
    : Math.abs(parsedAmountTotal);

  const parsedAccounts = accounts.map((account) => ({
    account_id: Number(account.account_id),
    direction: account.direction,
    amount: Number(account.amount),
  }));

  const hasInvalidAccount = parsedAccounts.some(
    (account) =>
      !Number.isInteger(account.account_id) ||
      !isValidDirection(account.direction) ||
      !(account.amount > 0)
  );
  if (hasInvalidAccount) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

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

    const currentEntriesResult = await client.query(
      `
      SELECT ta.account_id, ta.direction, ta.amount
      FROM transaction_accounts ta
      JOIN accounts a ON a.id = ta.account_id
      WHERE ta.transaction_id = $1 AND a.company_id = $2
      ORDER BY ta.account_id
      `,
      [id, req.user.company_id]
    );

    const oldAccountIds = currentEntriesResult.rows.map((entry) => entry.account_id);
    const newAccountIds = parsedAccounts.map((entry) => entry.account_id);
    const allAccountIds = [...new Set([...oldAccountIds, ...newAccountIds])].sort((a, b) => a - b);

    await validateTransactionRefs(client, req.user.company_id, {
      category_id,
      contact_id,
      property_id,
      job_id,
    });
    await lockCompanyAccounts(client, req.user.company_id, allAccountIds);

    for (const entry of currentEntriesResult.rows) {
      await client.query(
        `
        UPDATE accounts
        SET balance = balance - $1
        WHERE id = $2 AND company_id = $3
        `,
        [getAccountDelta(entry.direction, Number(entry.amount)), entry.account_id, req.user.company_id]
      );
    }

    const updatedResult = await client.query(
      `
      UPDATE transactions
      SET date = $1,
          type = $2,
          amount_total = $3,
          description = $4,
          category_id = $5,
          contact_id = $6,
          property_id = $7,
          job_id = $8
      WHERE id = $9 AND company_id = $10
      RETURNING *
      `,
      [
        date,
        type,
        normalizedAmountTotal,
        description,
        category_id,
        contact_id,
        property_id,
        job_id,
        id,
        req.user.company_id,
      ]
    );

    await client.query('DELETE FROM transaction_accounts WHERE transaction_id = $1', [id]);

    for (const account of parsedAccounts) {
      await client.query(
        `
        INSERT INTO transaction_accounts (transaction_id, account_id, direction, amount)
        VALUES ($1, $2, $3, $4)
        `,
        [id, account.account_id, account.direction, account.amount]
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
    return res.json(updatedResult.rows[0]);
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

    await client.query('DELETE FROM transactions WHERE id = $1 AND company_id = $2', [
      id,
      req.user.company_id,
    ]);

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
