import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

const normalizePropertyPayload = (payload) => ({
  name: payload.name?.trim(),
  notes: payload.notes ?? null,
  address: payload.address == null ? null : payload.address,
  contact_id: payload.contact_id == null ? null : Number(payload.contact_id),
  is_active: payload.is_active ?? true,
});

const validatePropertyPayload = async ({ name, address, contact_id, is_active }, companyId) => {
  if (!name || typeof is_active !== 'boolean' || (address != null && typeof address !== 'string')) {
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
      SELECT p.id, p.external_id, p.name, p.address, p.notes, p.contact_id, p.is_active, c.name AS contact_name
      FROM properties p
      LEFT JOIN contacts c ON p.contact_id = c.id
      WHERE p.company_id = $1
      ORDER BY p.name
      `,
      [req.companyId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

// One aggregate over all matching movements; pagination never changes the totals.
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { date_from: from = '', date_to: to = '' } = req.query;
  const validDate = (value) => typeof value === 'string' && (!value || (
    /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number(value.slice(0, 4)) > 0
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value
  ));
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !validDate(from) || !validDate(to) || (from && to && from > to)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(`
      SELECT p.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
             totals.income, totals.expense, totals.income - totals.expense AS net, totals.movement_count
      FROM properties p
      LEFT JOIN contacts c ON c.id = p.contact_id AND c.company_id = p.company_id
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(ABS(t.amount_total)) FILTER (WHERE t.type = 'income'), 0) AS income,
               COALESCE(SUM(ABS(t.amount_total)) FILTER (WHERE t.type = 'expense'), 0) AS expense,
               COUNT(*)::int AS movement_count
        FROM transactions t
        WHERE t.property_id = p.id AND t.company_id = p.company_id
          AND ($3::date IS NULL OR t.date >= $3::date)
          AND ($4::date IS NULL OR t.date <= $4::date)
      ) totals
      WHERE p.id = $1 AND p.company_id = $2`, [id, req.companyId, from || null, to || null]);
    if (!result.rowCount) return res.status(404).json({ error_code: 'NOT_FOUND' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const payload = normalizePropertyPayload(req.body);
  if (!(await validatePropertyPayload(payload, req.companyId))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }
  try {
    const result = await query(
      `
      INSERT INTO properties (company_id, name, notes, contact_id, is_active, address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [req.companyId, payload.name, payload.notes, payload.contact_id, payload.is_active, payload.address]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const payload = normalizePropertyPayload(req.body);

  if (!(await validatePropertyPayload(payload, req.companyId))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      `
      UPDATE properties
      SET name = $1, notes = $2, contact_id = $3, is_active = $4, address = $7
      WHERE id = $5 AND company_id = $6
      RETURNING *
      `,
      [payload.name, payload.notes, payload.contact_id, payload.is_active, id, req.companyId, payload.address]
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
