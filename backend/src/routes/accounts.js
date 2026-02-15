import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

const allowedTypes = ['cash', 'bank', 'card'];

const parseNumberOrNull = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, type, opening_balance, balance, is_active FROM accounts WHERE company_id = $1 ORDER BY name',
      [req.user.company_id]
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
      [req.user.company_id, name.trim(), type, parsedOpeningBalance, is_active]
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
      [name.trim(), type, parsedOpeningBalance, is_active, id, req.user.company_id]
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
  try {
    const result = await query(
      'DELETE FROM accounts WHERE id = $1 AND company_id = $2',
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
