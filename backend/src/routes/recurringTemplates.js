import express from 'express';
import { query } from '../db/index.js';
import { computeNextRunAtForTemplate, generateDueTemplates, generateTemplateNow } from '../services/recurring.js';
import { writeAuditLog } from '../services/audit.js';

const router = express.Router();
const validFrequencies = ['weekly', 'monthly', 'yearly'];

const parseNullableInteger = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseNullableNumber = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTemplatePayload = (payload = {}) => ({
  title: payload.title?.trim(),
  frequency: payload.frequency,
  interval: Number(payload.interval ?? 1),
  start_date: payload.start_date || null,
  end_date: payload.end_date || null,
  is_active: payload.is_active ?? true,
  amount: parseNullableNumber(payload.amount),
  movement_type: payload.movement_type,
  category_id: parseNullableInteger(payload.category_id),
  contact_id: parseNullableInteger(payload.contact_id),
  property_id: parseNullableInteger(payload.property_id),
  job_id: parseNullableInteger(payload.job_id),
  notes: payload.notes?.trim() || null,
  weekly_anchor_dow: parseNullableInteger(payload.weekly_anchor_dow),
  yearly_anchor_mm: parseNullableInteger(payload.yearly_anchor_mm),
  yearly_anchor_dd: parseNullableInteger(payload.yearly_anchor_dd),
});

const validateReference = async (table, id, companyId) => {
  if (id == null) {
    return true;
  }
  const result = await query(`SELECT id FROM ${table} WHERE id = $1 AND company_id = $2`, [id, companyId]);
  return result.rowCount > 0;
};

const validatePayload = async (payload, companyId) => {
  if (!payload.title || !validFrequencies.includes(payload.frequency)) {
    return false;
  }

  if (!Number.isInteger(payload.interval) || payload.interval < 1) {
    return false;
  }

  if (!(payload.amount > 0) || !['income', 'expense'].includes(payload.movement_type)) {
    return false;
  }

  if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
    return false;
  }

  const refs = await Promise.all([
    validateReference('categories', payload.category_id, companyId),
    validateReference('contacts', payload.contact_id, companyId),
    validateReference('properties', payload.property_id, companyId),
    validateReference('jobs', payload.job_id, companyId),
  ]);

  if (refs.some((refOk) => !refOk)) {
    return false;
  }

  if (payload.frequency === 'weekly') {
    if (payload.weekly_anchor_dow != null && (payload.weekly_anchor_dow < 1 || payload.weekly_anchor_dow > 7)) {
      return false;
    }
  }

  if (payload.frequency === 'yearly') {
    if (payload.yearly_anchor_mm != null && (payload.yearly_anchor_mm < 1 || payload.yearly_anchor_mm > 12)) {
      return false;
    }
    if (payload.yearly_anchor_dd != null && (payload.yearly_anchor_dd < 1 || payload.yearly_anchor_dd > 31)) {
      return false;
    }
  }

  return true;
};

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `
      SELECT rt.*,
             c.name AS category_name,
             ct.name AS contact_name,
             p.name AS property_name,
             j.title AS job_title
      FROM recurring_templates rt
      LEFT JOIN categories c ON c.id = rt.category_id
      LEFT JOIN contacts ct ON ct.id = rt.contact_id
      LEFT JOIN properties p ON p.id = rt.property_id
      LEFT JOIN jobs j ON j.id = rt.job_id
      WHERE rt.company_id = $1
      ORDER BY rt.next_run_at ASC, rt.id DESC
      `,
      [req.user.company_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM recurring_templates WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }
    await writeAuditLog({ companyId: req.user.company_id, userId: req.user.user_id, action: 'update', entityType: 'recurring_templates', entityId: result.rows[0].id, meta: { frequency: result.rows[0].frequency } });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', async (req, res) => {
  const payload = normalizeTemplatePayload(req.body);
  if (!(await validatePayload(payload, req.user.company_id))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const nextRunAt = computeNextRunAtForTemplate(payload);

  try {
    const result = await query(
      `
      INSERT INTO recurring_templates (
        company_id, title, frequency, interval, start_date, end_date, next_run_at,
        is_active, amount, movement_type, category_id, contact_id, property_id, job_id,
        notes, weekly_anchor_dow, yearly_anchor_mm, yearly_anchor_dd
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
      `,
      [
        req.user.company_id,
        payload.title,
        payload.frequency,
        payload.interval,
        payload.start_date,
        payload.end_date,
        nextRunAt,
        payload.is_active,
        payload.amount,
        payload.movement_type,
        payload.category_id,
        payload.contact_id,
        payload.property_id,
        payload.job_id,
        payload.notes,
        payload.frequency === 'weekly' ? payload.weekly_anchor_dow : null,
        payload.frequency === 'yearly' ? payload.yearly_anchor_mm : null,
        payload.frequency === 'yearly' ? payload.yearly_anchor_dd : null,
      ]
    );

    await writeAuditLog({ companyId: req.user.company_id, userId: req.user.user_id, action: 'create', entityType: 'recurring_templates', entityId: result.rows[0].id, meta: { frequency: result.rows[0].frequency } });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', async (req, res) => {
  const payload = normalizeTemplatePayload(req.body);
  if (!(await validatePayload(payload, req.user.company_id))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const nextRunAt = computeNextRunAtForTemplate(payload);

  try {
    const result = await query(
      `
      UPDATE recurring_templates
      SET title = $1,
          frequency = $2,
          interval = $3,
          start_date = $4,
          end_date = $5,
          next_run_at = $6,
          is_active = $7,
          amount = $8,
          movement_type = $9,
          category_id = $10,
          contact_id = $11,
          property_id = $12,
          job_id = $13,
          notes = $14,
          weekly_anchor_dow = $15,
          yearly_anchor_mm = $16,
          yearly_anchor_dd = $17,
          updated_at = NOW()
      WHERE id = $18 AND company_id = $19
      RETURNING *
      `,
      [
        payload.title,
        payload.frequency,
        payload.interval,
        payload.start_date,
        payload.end_date,
        nextRunAt,
        payload.is_active,
        payload.amount,
        payload.movement_type,
        payload.category_id,
        payload.contact_id,
        payload.property_id,
        payload.job_id,
        payload.notes,
        payload.frequency === 'weekly' ? payload.weekly_anchor_dow : null,
        payload.frequency === 'yearly' ? payload.yearly_anchor_mm : null,
        payload.frequency === 'yearly' ? payload.yearly_anchor_dd : null,
        req.params.id,
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
  try {
    const result = await query(
      'UPDATE recurring_templates SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }
    await writeAuditLog({ companyId: req.user.company_id, userId: req.user.user_id, action: 'delete', entityType: 'recurring_templates', entityId: req.params.id, meta: {} });
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/:id/generate-now', async (req, res) => {
  try {
    const result = await generateTemplateNow(Number(req.params.id), req.user.company_id);
    if (result.notFound) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    if (result.status === 'skipped') {
      return res.json({ status: 'skipped', reason: result.reason });
    }

    await writeAuditLog({ companyId: req.user.company_id, userId: req.user.user_id, action: 'generate', entityType: 'recurring_templates', entityId: req.params.id, meta: result });
    return res.json({ status: 'created', ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/generate-due', async (req, res) => {
  try {
    const result = await generateDueTemplates({ companyId: req.user.company_id, runType: 'manual' });
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
