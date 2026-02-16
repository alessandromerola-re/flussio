import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const parseNullableNumber = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableInteger = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const normalizeJobPayload = (payload = {}) => {
  const title = payload.title?.trim() || payload.name?.trim() || '';
  const codeRaw = payload.code?.trim();
  const startDateRaw = payload.start_date?.trim();
  const endDateRaw = payload.end_date?.trim();

  return {
    title,
    name: title,
    code: codeRaw || null,
    notes: payload.notes?.trim() || null,
    contact_id: parseNullableInteger(payload.contact_id),
    is_active: payload.is_active ?? true,
    is_closed: payload.is_closed ?? false,
    budget: parseNullableNumber(payload.budget),
    start_date: startDateRaw || null,
    end_date: endDateRaw || null,
  };
};

const validateJobPayload = async (payload, companyId, currentId = null) => {
  const {
    title,
    code,
    contact_id: contactId,
    is_active: isActive,
    is_closed: isClosed,
    budget,
    start_date: startDate,
    end_date: endDate,
  } = payload;

  if (!title || typeof isActive !== 'boolean' || typeof isClosed !== 'boolean') {
    return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
  }

  if (budget != null && budget < 0) {
    return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
  }

  if (startDate && !isoDateRegex.test(startDate)) {
    return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
  }

  if (endDate && !isoDateRegex.test(endDate)) {
    return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
  }

  if (startDate && endDate && endDate < startDate) {
    return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
  }

  if (contactId != null) {
    const contactResult = await query('SELECT id FROM contacts WHERE id = $1 AND company_id = $2', [
      contactId,
      companyId,
    ]);
    if (contactResult.rowCount === 0) {
      return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
    }
  }

  if (code) {
    const duplicateResult = await query(
      `
      SELECT id
      FROM jobs
      WHERE company_id = $1
        AND code = $2
        AND ($3::int IS NULL OR id <> $3)
      LIMIT 1
      `,
      [companyId, code, currentId]
    );

    if (duplicateResult.rowCount > 0) {
      return { valid: false, errorCode: 'VALIDATION_MISSING_FIELDS' };
    }
  }

  return { valid: true };
};

router.get('/', async (req, res) => {
  const activeOnly = req.query.active !== '0';
  const includeClosed = req.query.include_closed === '1';

  const where = ['j.company_id = $1'];
  const params = [req.user.company_id];

  if (activeOnly) {
    where.push('j.is_active = true');
  }

  if (!includeClosed) {
    where.push('j.is_closed = false');
  }

  try {
    const result = await query(
      `
      SELECT
        j.id,
        j.code,
        j.title,
        j.notes,
        j.contact_id,
        j.is_active,
        j.is_closed,
        j.budget,
        j.start_date,
        j.end_date,
        c.name AS contact_name
      FROM jobs j
      LEFT JOIN contacts c ON c.id = j.contact_id
      WHERE ${where.join(' AND ')}
      ORDER BY j.title
      `,
      params
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});



router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `
      SELECT
        j.id,
        j.code,
        j.title,
        j.notes,
        j.contact_id,
        j.is_active,
        j.is_closed,
        j.budget,
        j.start_date,
        j.end_date,
        c.name AS contact_name
      FROM jobs j
      LEFT JOIN contacts c ON c.id = j.contact_id
      WHERE j.id = $1
        AND j.company_id = $2
      LIMIT 1
      `,
      [id, req.user.company_id]
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

router.post('/', async (req, res) => {
  const payload = normalizeJobPayload(req.body);
  const validation = await validateJobPayload(payload, req.user.company_id);

  if (!validation.valid) {
    return res.status(400).json({ error_code: validation.errorCode });
  }

  try {
    const result = await query(
      `
      INSERT INTO jobs (
        company_id,
        name,
        title,
        code,
        notes,
        contact_id,
        is_active,
        is_closed,
        budget,
        start_date,
        end_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        req.user.company_id,
        payload.name,
        payload.title,
        payload.code,
        payload.notes,
        payload.contact_id,
        payload.is_active,
        payload.is_closed,
        payload.budget,
        payload.start_date,
        payload.end_date,
      ]
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
  const validation = await validateJobPayload(payload, req.user.company_id, Number(id));

  if (!validation.valid) {
    return res.status(400).json({ error_code: validation.errorCode });
  }

  try {
    const result = await query(
      `
      UPDATE jobs
      SET
        name = $1,
        title = $2,
        code = $3,
        notes = $4,
        contact_id = $5,
        is_active = $6,
        is_closed = $7,
        budget = $8,
        start_date = $9,
        end_date = $10
      WHERE id = $11
        AND company_id = $12
      RETURNING *
      `,
      [
        payload.name,
        payload.title,
        payload.code,
        payload.notes,
        payload.contact_id,
        payload.is_active,
        payload.is_closed,
        payload.budget,
        payload.start_date,
        payload.end_date,
        id,
        req.user.company_id,
      ]
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
      `
      UPDATE jobs
      SET is_active = false
      WHERE id = $1
        AND company_id = $2
      RETURNING id
      `,
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
