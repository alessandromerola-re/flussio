import { getClient } from '../db/index.js';
import { lockCompanyModules, readCompanyModules } from './registry.js';
import { modulePolicy } from './policy.js';
import { canRole, getRole } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';

export function assertModuleAccess(states, capabilities, action, { permissionGranted = false, technicalEnabled = true } = {}) {
  const result = modulePolicy.evaluate({ states, capabilities, action, permissionGranted, technicalEnabled });
  if (!result.allowed) throw Object.assign(new Error(result.code), { status: 403, code: result.code, details: result });
}

export function sendModuleError(res, error) {
  if (!error.status) console.error(error);
  return sendError(res, error.status || 500, error.status ? error.code || 'SERVER_ERROR' : 'SERVER_ERROR', 'Unable to process module operation.', { field: error.field, details: error.details });
}

// Only server-resolved identity/company/role reach these helpers. No authorization cache.
export const requireModuleRead = capabilities => async (req, res, next) => {
  try {
    const snapshot = await readCompanyModules(req.companyId);
    const states = Object.fromEntries(snapshot.modules.map(module => [module.code, module.state]));
    assertModuleAccess(states, capabilities, 'read', { permissionGranted: canRole(getRole(req), 'read') });
    return next();
  } catch (error) { return sendModuleError(res, error); }
};

// Lock order: company, then entities. Work and its audit must use the supplied client.
// A response is sent only after COMMIT; any work/commit error rolls everything back.
export async function withModuleWrite(companyId, capabilities, work, { action = 'write', permissionGranted = false } = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await lockCompanyModules(client, companyId);
    assertModuleAccess(current.states, capabilities, action, { permissionGranted });
    const result = await work(client, current);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export const moduleWriteRoute = (capabilities, work, action = 'write') => async (req, res) => {
  try {
    const result = await withModuleWrite(req.companyId, capabilities, client => work(req, client), {
      action, permissionGranted: canRole(getRole(req), action === 'delete' ? 'delete_sensitive' : 'write'),
    });
    return result.status === 204 ? res.status(204).send() : res.status(result.status || 200).json(result.body);
  } catch (error) { return sendModuleError(res, error); }
};

const linkFields = [['job_id', 'jobId', 'job_links'], ['property_id', 'propertyId', 'property_links']];
const invalidLink = field => Object.assign(new Error('Invalid module link'), { status: 400, code: 'VALIDATION_MISSING_FIELDS', field });
const parseLink = (value, field) => {
  if (value == null || value === '') return null;
  if (!['string', 'number'].includes(typeof value)) throw invalidLink(field);
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw invalidLink(field);
  return id;
};

// Omission preserves a historical link; explicit null removes it. Canonical null never
// falls through to a camelCase alias. Conflicting aliases are rejected, not guessed.
export function parseModuleLinks(payload) {
  const result = {};
  for (const [field, alias] of linkFields) {
    const canonical = Object.hasOwn(payload, field), alternate = Object.hasOwn(payload, alias);
    if (!canonical && !alternate) continue;
    const value = parseLink(canonical ? payload[field] : payload[alias], field);
    if (canonical && alternate && value !== parseLink(payload[alias], field)) throw invalidLink(field);
    result[field] = value;
  }
  return result;
}

export function assertModuleLinkChanges(states, previous, next, options) {
  for (const [field, , capability] of linkFields) {
    if ((previous[field] ?? null) !== (next[field] ?? null)) assertModuleAccess(states, [capability], 'write', options);
  }
}

export const requireTransactionFilterModules = async (req, res, next) => {
  const capabilities = [];
  for (const [field, , capability] of linkFields) {
    const dimension = field.slice(0, -3);
    if ((req.query[field] != null && req.query[field] !== '') || String(req.query[`missing_${dimension}`]) === '1') capabilities.push(capability);
  }
  if (!capabilities.length) return next();
  return requireModuleRead(capabilities)(req, res, next);
};
