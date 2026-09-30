import { randomUUID } from 'node:crypto';
import { getClient, query } from '../db/index.js';
import { MODULE_CATALOG, MODULE_CATALOG_VERSION } from './catalog.js';
import { modulePolicy } from './policy.js';

export const MODULE_ENFORCEMENT_READY = true;
const error = (code, status = 400) => Object.assign(new Error(code), { code, status });
const validId = id => /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) <= 2147483647;
const validVersion = version => typeof version === 'string' && /^(0|[1-9]\d*)$/.test(version);
const snapshot = (companyId, version, rows) => ({
  company_id: Number(companyId), version: String(version), catalog_version: MODULE_CATALOG_VERSION,
  enforcement_ready: MODULE_ENFORCEMENT_READY,
  modules: MODULE_CATALOG.map(module => {
    const row = rows.find(item => item.module_code === module.code);
    return { code: module.code, available: module.available, dependencies: [...module.dependencies],
      state: module.code === 'core' ? 'enabled' : row?.state || 'disabled',
      version: row ? String(row.version) : null, updated_at: row?.updated_at || null };
  }),
});

// One statement guarantees a coherent read of states and company version.
export async function readCompanyModules(companyId, {executor = { query }} = {}) {
  if (!validId(companyId)) throw error('VALIDATION_INVALID_COMPANY_ID');
  const result = await executor.query(`SELECT c.modules_version,
    COALESCE(jsonb_agg(jsonb_build_object('module_code', m.module_code, 'state', m.state,
      'version', m.version::text, 'updated_at', m.updated_at)) FILTER (WHERE m.module_code IS NOT NULL), '[]'::jsonb) AS modules
    FROM companies c LEFT JOIN company_modules m ON m.company_id=c.id
    WHERE c.id=$1 GROUP BY c.id`, [companyId]);
  if (!result.rowCount) throw error('NOT_FOUND', 404);
  return snapshot(companyId, result.rows[0].modules_version, result.rows[0].modules);
}

// The supplied client MUST already be in a transaction. All future module writers
// acquire this company lock before entity locks, and hold it until commit/rollback.
export async function lockCompanyModules(client, companyId, { exclusive = false } = {}) {
  if (!validId(companyId)) throw error('VALIDATION_INVALID_COMPANY_ID');
  const result = await client.query(`SELECT modules_version FROM companies WHERE id=$1 FOR ${exclusive ? 'UPDATE' : 'SHARE'}`, [companyId]);
  if (!result.rowCount) throw error('NOT_FOUND', 404);
  const rows = await client.query('SELECT module_code, state, version, updated_at FROM company_modules WHERE company_id=$1 ORDER BY module_code', [companyId]);
  return { version: String(result.rows[0].modules_version), rows: rows.rows,
    states: Object.fromEntries(rows.rows.map(row => [row.module_code, row.state])) };
}

// All resource adapters enforce these states. The HTTP route additionally verifies
// the URL company and current superadmin; actor authority is reread under lock here.
// Actor authority is reread from the database, never supplied as a client boolean.
export async function applyCompanyModulePlan({ companyId, actorUserId, expectedVersion, reason, changes }) {
  if (!validId(companyId) || !validId(actorUserId) || !validVersion(expectedVersion)
    || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) throw error('MODULE_PLAN_INVALID');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await lockCompanyModules(client, companyId, { exclusive: true });
    const actor = await client.query('SELECT is_super_admin, is_active FROM users WHERE id=$1 FOR SHARE', [actorUserId]);
    if (actor.rows[0]?.is_super_admin !== true || actor.rows[0]?.is_active !== true) throw error('FORBIDDEN', 403);
    if (current.version !== expectedVersion) throw error('MODULE_VERSION_CONFLICT', 409);
    const plan = modulePolicy.preview(current.states, changes);
    if (!plan.allowed) throw error(plan.code, plan.code === 'MODULE_PLAN_INVALID' ? 400 : 409);
    const changed = plan.changes.filter(change => change.from !== change.to);
    if (!changed.length) {
      await client.query('COMMIT');
      return { ...snapshot(companyId, current.version, current.rows), operation_id: null };
    }
    const version = (BigInt(current.version) + 1n).toString(), operation = randomUUID();
    for (const change of changed) {
      await client.query(`INSERT INTO company_modules(company_id,module_code,state,updated_by)
        VALUES ($1,$2,$3,$4) ON CONFLICT(company_id,module_code) DO UPDATE
        SET state=EXCLUDED.state,version=company_modules.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [companyId, change.module, change.to, actorUserId]);
      await client.query(`INSERT INTO company_module_events(operation_id,company_id,module_code,previous_state,new_state,actor_user_id,reason,company_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [operation,companyId,change.module,change.from,change.to,actorUserId,reason.trim(),version]);
    }
    await client.query('UPDATE companies SET modules_version=$2 WHERE id=$1', [companyId, version]);
    const rows = await client.query('SELECT module_code,state,version,updated_at FROM company_modules WHERE company_id=$1', [companyId]);
    await client.query('COMMIT');
    return { ...snapshot(companyId, version, rows.rows), operation_id: operation };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}
