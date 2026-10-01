import { query } from '../db/index.js';
import { isValidISODate } from '../utils/dateParse.js';
import { moneyCents } from '../utils/movementValidation.js';
const validFrequencies = ['weekly', 'monthly', 'yearly'];

const parseNullableInteger = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return ['string', 'number'].includes(typeof value) && Number.isInteger(parsed) && parsed > 0 && parsed <= 2147483647 ? parsed : NaN;
};

const parseNullableNumber = (value) => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeTemplatePayload = (payload = {}) => ({
  title: typeof payload.title === 'string' ? payload.title.trim() : '',
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
  notes: typeof payload.notes === 'string' ? payload.notes.trim() || null : null,
  weekly_anchor_dow: parseNullableInteger(payload.weekly_anchor_dow),
  yearly_anchor_mm: parseNullableInteger(payload.yearly_anchor_mm),
  yearly_anchor_dd: parseNullableInteger(payload.yearly_anchor_dd),
});

const validateReference = async (table, id, companyId, { activeOnly = false, executor = { query } } = {}) => {
  if (id == null) {
    return true;
  }
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) return false;
  const result = await executor.query(
    `SELECT id FROM ${table} WHERE id = $1 AND company_id = $2${activeOnly ? ' AND is_active = true' : ''}`,
    [id, companyId]
  );
  return result.rowCount > 0;
};

export const validatePayload = async (payload, companyId, executor = { query }) => {
  if (!payload.title) {
    return { valid: false, status: 400, errorCode: 'VALIDATION_MISSING_FIELDS', field: 'title' };
  }

  if (!validFrequencies.includes(payload.frequency)) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_FREQUENCY', field: 'frequency' };
  }

  if (!Number.isInteger(payload.interval) || payload.interval < 1) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_INTERVAL', field: 'interval' };
  }

  if (!(payload.amount > 0) || moneyCents(payload.amount) == null) {
    return { valid: false, status: 400, errorCode: 'RECURRING_MISSING_AMOUNT', field: 'amount' };
  }

  if (!['income', 'expense'].includes(payload.movement_type)) {
    return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_MOVEMENT_TYPE', field: 'movement_type' };
  }

  if (payload.account_id == null) {
    return { valid: false, status: 400, errorCode: 'RECURRING_MISSING_ACCOUNT', field: 'account_id' };
  }

  if (typeof payload.is_active !== 'boolean' || [payload.start_date, payload.end_date].some(date => date != null && !isValidISODate(date))) return { valid: false, status: 400, errorCode: 'VALIDATION_MISSING_FIELDS' };

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
    if (payload.weekly_anchor_dow != null && (!Number.isInteger(payload.weekly_anchor_dow) || payload.weekly_anchor_dow < 1 || payload.weekly_anchor_dow > 7)) {
      return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_ANCHOR' };
    }
  }

  if (payload.frequency === 'yearly') {
    if (payload.yearly_anchor_mm != null && (!Number.isInteger(payload.yearly_anchor_mm) || payload.yearly_anchor_mm < 1 || payload.yearly_anchor_mm > 12)) {
      return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_ANCHOR' };
    }
    if (payload.yearly_anchor_dd != null && (!Number.isInteger(payload.yearly_anchor_dd) || payload.yearly_anchor_dd < 1 || payload.yearly_anchor_dd > 31)) {
      return { valid: false, status: 400, errorCode: 'RECURRING_INVALID_ANCHOR' };
    }
  }

  return { valid: true };
};
