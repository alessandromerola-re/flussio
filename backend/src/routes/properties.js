import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    try {
      const result = await query(
        `
        SELECT p.id, p.name, p.notes, p.contact_id, p.is_active, c.name AS contact_name
        FROM properties p
        LEFT JOIN contacts c ON p.contact_id = c.id
        WHERE p.company_id = $1
        ORDER BY p.name
        `,
        [req.user.company_id]
      );
      return res.json(result.rows);
    } catch (error) {
      if (error.code !== '42703') {
        throw error;
      }
      const fallback = await query(
        `
        SELECT id, name, notes, is_active
        FROM properties
        WHERE company_id = $1
        ORDER BY name
        `,
        [req.user.company_id]
      );
      return res.json(fallback.rows);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const { name, notes = null, contact_id = null, is_active = true } = req.body;
  if (!name) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(
      `
      INSERT INTO properties (company_id, name, notes, contact_id, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [req.user.company_id, name, notes, contact_id, is_active]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, notes, contact_id, is_active } = req.body;
  try {
    const result = await query(
      `
      UPDATE properties
      SET name = $1, notes = $2, contact_id = $3, is_active = $4
      WHERE id = $5 AND company_id = $6
      RETURNING *
      `,
      [name, notes, contact_id, is_active, id, req.user.company_id]
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
    const result = await query('DELETE FROM properties WHERE id = $1 AND company_id = $2', [
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
