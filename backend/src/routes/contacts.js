import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    const params = [req.user.company_id];
    let sql = `
      SELECT contacts.*, categories.name AS default_category_name, categories.direction AS default_category_direction
      FROM contacts
      LEFT JOIN categories ON contacts.default_category_id = categories.id
      WHERE contacts.company_id = $1
    `;
    if (search) {
      params.push(`%${search}%`);
      sql += ' AND (contacts.name ILIKE $2 OR contacts.email ILIKE $2)';
    }
    sql += ' ORDER BY contacts.name';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const { name, email = null, phone = null, default_category_id = null, is_active = true } = req.body;
  if (!name) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(
      'INSERT INTO contacts (company_id, name, email, phone, default_category_id, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.company_id, name, email, phone, default_category_id, is_active]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, default_category_id, is_active } = req.body;
  try {
    const result = await query(
      'UPDATE contacts SET name = $1, email = $2, phone = $3, default_category_id = $4, is_active = $5 WHERE id = $6 AND company_id = $7 RETURNING *',
      [name, email, phone, default_category_id, is_active, id, req.user.company_id]
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
    const result = await query('DELETE FROM contacts WHERE id = $1 AND company_id = $2', [
      id,
      req.user.company_id,
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
