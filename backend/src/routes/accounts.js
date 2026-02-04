import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, type, balance, is_active FROM accounts WHERE company_id = $1 ORDER BY name',
      [req.user.company_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const { name, type, balance = 0, is_active = true } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(
      'INSERT INTO accounts (company_id, name, type, balance, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.company_id, name, type, balance, is_active]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, type, balance, is_active } = req.body;
  const { id } = req.params;
  try {
    const result = await query(
      'UPDATE accounts SET name = $1, type = $2, balance = $3, is_active = $4 WHERE id = $5 AND company_id = $6 RETURNING *',
      [name, type, balance, is_active, id, req.user.company_id]
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
