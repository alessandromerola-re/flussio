import express from 'express';
import { getClient, query } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const limit = Number(req.query.limit) || 30;
  try {
    const result = await query(
      `
      SELECT
        t.*, 
        c.name AS category_name,
        ct.name AS contact_name,
        p.name AS property_name,
        json_agg(
          json_build_object(
            'account_id', ta.account_id,
            'direction', ta.direction,
            'amount', ta.amount,
            'account_name', a.name
          ) ORDER BY ta.id
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

  if (!date || !type || !amount_total || accounts.length === 0) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
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

    for (const account of accounts) {
      await client.query(
        `
        INSERT INTO transaction_accounts (transaction_id, account_id, direction, amount)
        VALUES ($1, $2, $3, $4)
        `,
        [transaction.id, account.account_id, account.direction, account.amount]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(transaction);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      'DELETE FROM transactions WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
