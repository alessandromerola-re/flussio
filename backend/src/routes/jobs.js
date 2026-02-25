import express from 'express';
import { query } from '../db/index.js';
import { writeAuditLog } from '../services/audit.js';
import { sendError } from '../utils/httpErrors.js';

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
    return { valid: false, status: 400, errorCode: 'VALIDATION_MISSING_FIELDS' };
  }

  if (budget != null && budget < 0) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_MISSING_FIELDS', field: 'budget' };
  }

  if (startDate && !isoDateRegex.test(startDate)) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_INVALID_DATE_RANGE', field: 'start_date' };
  }

  if (endDate && !isoDateRegex.test(endDate)) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_INVALID_DATE_RANGE', field: 'end_date' };
  }

  if (startDate && endDate && endDate < startDate) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_INVALID_DATE_RANGE', field: 'end_date' };
  }

  if (contactId != null) {
    const contactResult = await query('SELECT id FROM contacts WHERE id = $1 AND company_id = $2', [
      contactId,
      companyId,
    ]);
    if (contactResult.rowCount === 0) {
      return { valid: false, status: 400, errorCode: 'VALIDATION_MISSING_FIELDS', field: 'contact_id' };
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
      return { valid: false, status: 409, errorCode: 'JOB_CODE_ALREADY_EXISTS', field: 'code' };
    }
  }

  return { valid: true };
};

router.get('/', async (req, res) => {
  const activeRaw = req.query.active == null ? '' : String(req.query.active).trim().toLowerCase();
  const includeClosedRaw = req.query.include_closed == null ? '' : String(req.query.include_closed).trim().toLowerCase();

  const where = ['j.company_id = $1'];
  const params = [req.companyId];

  // Backward compatibility:
  // - active=0 historically meant "do not filter by active"
  // - active=1 meant active only
  // - active=false means inactive only
  if (['1', 'true', 'yes'].includes(activeRaw)) {
    where.push('j.is_active = true');
  } else if (['false', 'no'].includes(activeRaw)) {
    where.push('j.is_active = false');
  }

  // include_closed=0 => open jobs only
  // include_closed=1 => include all (no filter)
  if (['0', 'false', 'no'].includes(includeClosedRaw)) {
    where.push('j.is_closed = false');
  }

  try {
    const result = await query(
      `
      SELECT
        j.id,
        j.name,
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
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
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
      [id, req.companyId]
    );

    if (result.rowCount === 0) {
      return sendError(res, 404, 'JOB_NOT_FOUND', 'Commessa non trovata.');
    }


    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/', async (req, res) => {
  const payload = normalizeJobPayload(req.body);
  const validation = await validateJobPayload(payload, req.companyId);

  if (!validation.valid) {
    const messageByCode = {
      JOB_CODE_ALREADY_EXISTS: 'Codice commessa già usato.',
      VALIDATION_INVALID_DATE_RANGE: 'Intervallo date non valido.',
      VALIDATION_MISSING_FIELDS: 'Compila i campi richiesti.',
    };
    return sendError(res, validation.status || 400, validation.errorCode, messageByCode[validation.errorCode] || 'Dati commessa non validi.', { field: validation.field });
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
        req.companyId,
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
    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'create',
      entityType: 'jobs',
      entityId: result.rows[0].id,
      meta: { title: result.rows[0].title },
    });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const payload = normalizeJobPayload(req.body);
  const validation = await validateJobPayload(payload, req.companyId, Number(id));

  if (!validation.valid) {
    const messageByCode = {
      JOB_CODE_ALREADY_EXISTS: 'Codice commessa già usato.',
      VALIDATION_INVALID_DATE_RANGE: 'Intervallo date non valido.',
      VALIDATION_MISSING_FIELDS: 'Compila i campi richiesti.',
    };
    return sendError(res, validation.status || 400, validation.errorCode, messageByCode[validation.errorCode] || 'Dati commessa non validi.', { field: validation.field });
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
        req.companyId,
      ]
    );

    if (result.rowCount === 0) {
      return sendError(res, 404, 'JOB_NOT_FOUND', 'Commessa non trovata.');
    }

    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'update',
      entityType: 'jobs',
      entityId: result.rows[0].id,
      meta: { title: result.rows[0].title },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
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
      [id, req.companyId]
    );

    if (result.rowCount === 0) {
      return sendError(res, 404, 'JOB_NOT_FOUND', 'Commessa non trovata.');
    }

    await writeAuditLog({
      companyId: req.companyId,
      userId: req.user.user_id,
      action: 'delete',
      entityType: 'jobs',
      entityId: id,
      meta: {},
    });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

export default router;
