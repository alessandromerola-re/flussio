import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

const normalizeJobPayload = (payload) => ({
  name: payload.name?.trim(),
  notes: payload.notes ?? null,
  contact_id: payload.contact_id == null ? null : Number(payload.contact_id),
  is_active: payload.is_active ?? true,
});

const validateJobPayload = async ({ name, contact_id, is_active }, companyId) => {
  if (!name || typeof is_active !== 'boolean') {
    return false;
  }

  if (contact_id != null) {
    if (!Number.isInteger(contact_id)) {
      return false;
    }

    const contactResult = await query('SELECT id FROM contacts WHERE id = $1 AND company_id = $2', [
      contact_id,
      companyId,
    ]);
    if (contactResult.rowCount === 0) {
      return false;
    }
  }

  return true;
};

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `
      SELECT j.id, j.name, j.notes, j.contact_id, j.is_active, c.name AS contact_name
      FROM jobs j
      LEFT JOIN contacts c ON j.contact_id = c.id
      WHERE j.company_id = $1
      ORDER BY j.name
      `,
      [req.user.company_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const payload = normalizeJobPayload(req.body);
  if (!(await validateJobPayload(payload, req.user.company_id))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      `
      INSERT INTO jobs (company_id, name, notes, contact_id, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [req.user.company_id, payload.name, payload.notes, payload.contact_id, payload.is_active]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const payload = normalizeJobPayload(req.body);

  if (!(await validateJobPayload(payload, req.user.company_id))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      `
      UPDATE jobs
      SET name = $1, notes = $2, contact_id = $3, is_active = $4
      WHERE id = $5 AND company_id = $6
      RETURNING *
      `,
      [payload.name, payload.notes, payload.contact_id, payload.is_active, id, req.user.company_id]
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
    const result = await query('DELETE FROM jobs WHERE id = $1 AND company_id = $2', [
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
