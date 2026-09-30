import { getClient } from '../db/index.js';
import { lockCompanyModules } from './registry.js';
import { assertModuleAccess } from './access.js';

// Input is the server-normalized spec, never a client-supplied capability list.
export function reportCapabilities(spec) {
  if (!spec || spec.error || !['standard', 'budget', 'quality', 'yoy', 'mom'].includes(spec.reportKind)
    || !Array.isArray(spec.groupBy) || !spec.filters || typeof spec.filters !== 'object' || Array.isArray(spec.filters)
    || (spec.reportKind === 'quality' && !Array.isArray(spec.qualityDimensions))) {
    throw Object.assign(new Error('Invalid normalized report'), { code: 'VALIDATION_MISSING_FIELDS', status: 400 });
  }
  const result = ['general_reports'];
  for (const [dimension, capability] of [['job', 'job_reports'], ['property', 'property_reports']]) {
    if ((dimension === 'job' && spec.reportKind === 'budget') || spec.groupBy.includes(dimension)
      || spec.filters[`${dimension}Id`] != null
      || (spec.reportKind === 'quality' && spec.qualityDimensions.includes(dimension))) result.push(capability);
  }
  return result;
}

// PostgreSQL forbids FOR SHARE in a READ ONLY transaction. Keep REPEATABLE READ
// for coherent report rows/totals, with the company lock held until commit.
// A revocation committed while acquiring the lock can cause 40001: retry the
// whole transaction with a fresh snapshot, never reuse an authorization result.
export async function withCompanyReport(companyId, capabilities, work, { action = 'read', permissionGranted = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = await getClient();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const current = await lockCompanyModules(client, companyId);
      assertModuleAccess(current.states, capabilities, action, { permissionGranted });
      const result = await work(client, current);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code !== '40001' || attempt === 2) throw error;
    } finally { client.release(); }
  }
}
