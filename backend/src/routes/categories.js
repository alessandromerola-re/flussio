import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { direction } = req.query;
  try {
    const params = [req.companyId];
    let sql =
      'SELECT id, name, direction, parent_id, color, is_active FROM categories WHERE company_id = $1';
    if (direction) {
      params.push(direction);
      sql += ' AND direction = $2';
    }
    sql += ' ORDER BY name';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const { name, direction, parent_id = null, color = null, is_active = true } = req.body;
  if (!name || !direction) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(
      'INSERT INTO categories (company_id, name, direction, parent_id, color, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.companyId, name, direction, parent_id, color, is_active]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, direction, parent_id, color, is_active } = req.body;
  try {
    const result = await query(
      'UPDATE categories SET name = $1, direction = $2, parent_id = $3, color = $4, is_active = $5 WHERE id = $6 AND company_id = $7 RETURNING *',
      [name, direction, parent_id, color, is_active, id, req.companyId]
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
    const result = await query('DELETE FROM categories WHERE id = $1 AND company_id = $2', [
      id,
      req.companyId,
    ]);
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
