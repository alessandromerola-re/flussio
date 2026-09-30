import express from 'express';
import { moduleWriteRoute, assertModuleLinkChanges, assertRecurringActivation, parseModuleLinks, recurringModuleBlock } from '../modules/access.js';
import { readCompanyModules } from '../modules/registry.js';
import { canRole } from '../middleware/permissions.js';
import { query } from '../db/index.js';
import { recurringGeneratorEnabled, computeNextRunAtForTemplate, generateDueTemplates, generateTemplateNow } from '../services/recurring.js';
import { writeAuditLog } from '../services/audit.js';
import { sendError } from '../utils/httpErrors.js';

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
  account_id: parseNullableInteger(payload.account_id),
  category_id: parseNullableInteger(payload.category_id),
  contact_id: parseNullableInteger(payload.contact_id),
  property_id: parseNullableInteger(payload.property_id),
  job_id: parseNullableInteger(payload.job_id),
  notes: payload.notes?.trim() || null,
  weekly_anchor_dow: parseNullableInteger(payload.weekly_anchor_dow),
  yearly_anchor_mm: parseNullableInteger(payload.yearly_anchor_mm),
  yearly_anchor_dd: parseNullableInteger(payload.yearly_anchor_dd),
});

const validateReference = async (table, id, companyId, { activeOnly = false, executor = { query } } = {}) => {
  if (id == null) {
    return { valid: true };
  }
  const result = await executor.query(
    `SELECT id FROM ${table} WHERE id = $1 AND company_id = $2${activeOnly ? ' AND is_active = true' : ''}`,
    [id, companyId]
  );
  return result.rowCount > 0;
};

const validatePayload = async (payload, companyId, executor = { query }) => {
  if (!payload.title) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_MISSING_FIELDS', field: 'title' };
  }

  if (!validFrequencies.includes(payload.frequency)) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_FREQUENCY', field: 'frequency' };
  }

  if (!Number.isInteger(payload.interval) || payload.interval < 1) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_INTERVAL', field: 'interval' };
  }

  if (!(payload.amount > 0)) {
    return { valid: false, status: 400, errorCode: 'RECURRING_MISSING_AMOUNT', field: 'amount' };
  }

  if (!['income', 'expense'].includes(payload.movement_type)) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_MOVEMENT_TYPE', field: 'movement_type' };
  }

  if (payload.account_id == null) {
    return { valid: false, status: 400, errorCode: 'RECURRING_MISSING_ACCOUNT', field: 'account_id' };
  }

  if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_INVALID_DATE_RANGE', field: 'end_date' };
  }

  const refs = await Promise.all([
    validateReference('accounts', payload.account_id, companyId, { activeOnly: true, executor }),
    validateReference('categories', payload.category_id, companyId, { executor }),
    validateReference('contacts', payload.contact_id, companyId, { executor }),
    validateReference('properties', payload.property_id, companyId, { executor }),
    validateReference('jobs', payload.job_id, companyId, { executor }),
  ]);

  if (refs.some((refOk) => !refOk)) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_REFERENCE' };
  }

  if (payload.frequency === 'weekly') {
    if (payload.weekly_anchor_dow != null && (payload.weekly_anchor_dow < 1 || payload.weekly_anchor_dow > 7)) {
      return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_ANCHOR' };
    }
  }

  if (payload.frequency === 'yearly') {
    if (payload.yearly_anchor_mm != null && (payload.yearly_anchor_mm < 1 || payload.yearly_anchor_mm > 12)) {
      return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_ANCHOR' };
    }
    if (payload.yearly_anchor_dd != null && (payload.yearly_anchor_dd < 1 || payload.yearly_anchor_dd > 31)) {
      return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_ANCHOR' };
    }
  }

  return { valid: true };
};

const statesForCompany = async companyId => Object.fromEntries((await readCompanyModules(companyId)).modules.map(module => [module.code, module.state]));
const withSuspension = (row, states) => ({ ...row, module_suspension: recurringModuleBlock(states, row) });
const fail = (code, status = 400, field) => Object.assign(new Error(code), { code, status, field });
const normalizeWithLinks = (body, previous = {}) => {
  const links = parseModuleLinks(body);
  return { ...normalizeTemplatePayload(body),
    job_id: Object.hasOwn(links, 'job_id') ? links.job_id : previous.job_id ?? null,
    property_id: Object.hasOwn(links, 'property_id') ? links.property_id : previous.property_id ?? null,
    is_active: Object.hasOwn(body, 'is_active') ? body.is_active : previous.is_active ?? true,
  };
};

router.get('/status', (req, res) => res.json({
  generator_enabled: recurringGeneratorEnabled(),
}));

router.get('/:id/runs', async (req, res) => {
  const id = Number(req.params.id);
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Parametri non validi.');
  }
  try {
    const template = await query('SELECT id FROM recurring_templates WHERE id=$1 AND company_id=$2', [id, req.companyId]);
    if (!template.rowCount) return sendError(res, 404, 'NOT_FOUND', 'Template non trovato.');
    const result = await query(`SELECT r.id, r.cycle_key, r.run_at, r.run_type, t.id AS generated_movement_id
      FROM recurring_runs r JOIN recurring_templates rt ON rt.id=r.template_id
      LEFT JOIN transactions t ON t.id=r.generated_movement_id AND t.company_id=rt.company_id
      WHERE rt.id=$1 AND rt.company_id=$2 ORDER BY r.run_at DESC, r.id DESC LIMIT 21 OFFSET $3`, [id, req.companyId, offset]);
    return res.json({ rows: result.rows.slice(0, 20), has_more: result.rows.length > 20 });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/', async (req, res) => {
  try {
    const states = await statesForCompany(req.companyId);
    const result = await query(
      `
      SELECT rt.*,
             a.name AS account_name, a.is_active AS account_is_active,
             c.name AS category_name,
             ct.name AS contact_name,
             p.name AS property_name,
             j.title AS job_title
      FROM recurring_templates rt
      LEFT JOIN accounts a ON a.id = rt.account_id AND a.company_id = rt.company_id
      LEFT JOIN categories c ON c.id = rt.category_id AND c.company_id = rt.company_id
      LEFT JOIN contacts ct ON ct.id = rt.contact_id AND ct.company_id = rt.company_id
      LEFT JOIN properties p ON p.id = rt.property_id AND p.company_id = rt.company_id
      LEFT JOIN jobs j ON j.id = rt.job_id AND j.company_id = rt.company_id
      WHERE rt.company_id = $1
      ORDER BY rt.next_run_at ASC, rt.id DESC
      `,
      [req.companyId]
    );
    return res.json(result.rows.map(row => withSuspension(row, states)));
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const states = await statesForCompany(req.companyId);
    const result = await query(
      'SELECT * FROM recurring_templates WHERE id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );
    if (result.rowCount === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'Template non trovato.');
    }
    return res.json(withSuspension(result.rows[0], states));
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/', moduleWriteRoute(['recurring'], async (req, client, current) => {
  const query = client.query.bind(client);
  const payload = normalizeWithLinks(req.body);
  assertModuleLinkChanges(current.states, {}, payload, { permissionGranted: canRole(req.companyRole, 'write') });
  const validation = await validatePayload(payload, req.companyId, client);
  if (!validation.valid) {
    throw fail(validation.errorCode, validation.status || 400, validation.field);
  }

  const nextRunAt = computeNextRunAtForTemplate(payload);

    const result = await query(
      `
      INSERT INTO recurring_templates (
        company_id, title, frequency, interval, start_date, end_date, next_run_at,
        is_active, amount, movement_type, account_id, category_id, contact_id, property_id, job_id,
        notes, weekly_anchor_dow, yearly_anchor_mm, yearly_anchor_dd
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
      `,
      [
        req.companyId,
        payload.title,
        payload.frequency,
        payload.interval,
        payload.start_date,
        payload.end_date,
        nextRunAt,
        payload.is_active,
        payload.amount,
        payload.movement_type,
        payload.account_id,
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

    await writeAuditLog({ client, companyId: req.companyId, userId: req.user.user_id, action: 'create', entityType: 'recurring_templates', entityId: result.rows[0].id, meta: { frequency: result.rows[0].frequency } });
    return { status: 201, body: withSuspension(result.rows[0], current.states) };
}));

router.put('/:id', moduleWriteRoute(['recurring'], async (req, client, current) => {
  const query = client.query.bind(client);
  const old = await query('SELECT * FROM recurring_templates WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, req.companyId]);
  if (!old.rowCount) throw fail('NOT_FOUND', 404);
  const payload = normalizeWithLinks(req.body, old.rows[0]);
  assertModuleLinkChanges(current.states, old.rows[0], payload, { permissionGranted: canRole(req.companyRole, 'write') });
  if (payload.is_active && !old.rows[0].is_active) assertRecurringActivation(current.states, payload, { permissionGranted: canRole(req.companyRole, 'write') });
  const validation = await validatePayload(payload, req.companyId, client);
  if (!validation.valid) {
    throw fail(validation.errorCode, validation.status || 400, validation.field);
  }

  const nextRunAt = computeNextRunAtForTemplate(payload);

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
          account_id = $10,
          category_id = $11,
          contact_id = $12,
          property_id = $13,
          job_id = $14,
          notes = $15,
          weekly_anchor_dow = $16,
          yearly_anchor_mm = $17,
          yearly_anchor_dd = $18,
          updated_at = NOW()
      WHERE id = $19 AND company_id = $20
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
        payload.account_id,
        payload.category_id,
        payload.contact_id,
        payload.property_id,
        payload.job_id,
        payload.notes,
        payload.frequency === 'weekly' ? payload.weekly_anchor_dow : null,
        payload.frequency === 'yearly' ? payload.yearly_anchor_mm : null,
        payload.frequency === 'yearly' ? payload.yearly_anchor_dd : null,
        req.params.id,
        req.companyId,
      ]
    );

    if (result.rowCount === 0) {
      throw fail('NOT_FOUND', 404);
    }

    await writeAuditLog({ client, companyId: req.companyId, userId: req.user.user_id, action: 'update', entityType: 'recurring_templates', entityId: result.rows[0].id, meta: { frequency: result.rows[0].frequency } });
    return { body: withSuspension(result.rows[0], current.states) };
}));

router.patch('/:id/active', moduleWriteRoute(['recurring'], async (req, client, current) => {
  if (typeof req.body?.is_active !== 'boolean') throw fail('VALIDATION_INVALID_ACTIVE_STATE');
  const old = await client.query('SELECT * FROM recurring_templates WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, req.companyId]);
  if (!old.rowCount) throw fail('NOT_FOUND', 404);
  if (req.body.is_active) {
    assertRecurringActivation(current.states, old.rows[0], { permissionGranted: canRole(req.companyRole, 'delete_sensitive') });
    const account = await client.query('SELECT id FROM accounts WHERE id=$1 AND company_id=$2 AND is_active=true', [old.rows[0].account_id, req.companyId]);
    if (!account.rowCount) throw fail('RECURRING_MISSING_ACCOUNT');
  }
  const result = await client.query('UPDATE recurring_templates SET is_active=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *', [req.body.is_active, req.params.id, req.companyId]);
  await writeAuditLog({ client, companyId: req.companyId, userId: req.user.user_id, action: req.body.is_active ? 'activate' : 'deactivate', entityType: 'recurring_templates', entityId: req.params.id, meta: {} });
  return { body: withSuspension(result.rows[0], current.states) };
}, 'delete'));

router.delete('/:id', moduleWriteRoute(['recurring'], async (req, client) => {
  const result = await client.query('UPDATE recurring_templates SET is_active=false, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id', [req.params.id, req.companyId]);
  if (!result.rowCount) throw fail('NOT_FOUND', 404);
  await writeAuditLog({ client, companyId: req.companyId, userId: req.user.user_id, action: 'delete', entityType: 'recurring_templates', entityId: req.params.id, meta: {} });
  return { status: 204 };
}, 'delete'));

router.post('/:id/generate-now', async (req, res) => {
  try {
    const result = await generateTemplateNow(Number(req.params.id), req.companyId, { actorUserId: req.user.user_id });
    if (result.notFound) {
      return sendError(res, 404, 'NOT_FOUND', 'Template non trovato.');
    }

    if (result.status === 'skipped') {
      const code = result.code || (['missing_account', 'account_unavailable'].includes(result.reason)
        ? 'RECURRING_MISSING_ACCOUNT'
        : 'RECURRING_ALREADY_GENERATED');
      return res.json({ ...result, code });
    }

    return res.json({ status: 'created', ...result });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/generate-due', async (req, res) => {
  try {
    const result = await generateDueTemplates({ companyId: req.companyId, runType: 'manual', actorUserId: req.user.user_id });
    return res.json(result);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

export default router;
