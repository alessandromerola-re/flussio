import { reportSnapshots } from '../services/reportSnapshots.js';
import { runSpecialReport } from '../services/reportComparisons.js';
import express from 'express';
import { requirePermission, getRole, canRole } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';
import { buildAdvancedReportQuery, buildTotalsQuery, toCsv, validateAndNormalizeSpec } from '../services/advancedReports.js';
import { reportCapabilities, withCompanyReport } from '../modules/reportAccess.js';
import { assertModuleAccess, sendModuleError } from '../modules/access.js';
import { modulePolicy } from '../modules/policy.js';

const router = express.Router();
const permission = (req, action) => canRole(getRole(req), action === 'read' ? 'read' : 'export');
const reportWork = (req, spec, work, action = 'read') => withCompanyReport(req.companyId, reportCapabilities(spec), work, { action, permissionGranted: permission(req, action) });
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
const validSavedId = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
const normalize = (input, companyId) => {
  const spec = validateAndNormalizeSpec(input, companyId);
  if (spec.error) throw Object.assign(fail(spec.error.code), { field: spec.error.field });
  return spec;
};
const canEditSaved = (req, row) => row.created_by_user_id === req.user.user_id || getRole(req) === 'admin';
const missingSavedTable = error => error?.code === '42P01';
const savedError = (res, error) => missingSavedTable(error)
  ? sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Migrazione report salvati non applicata.') : sendModuleError(res, error);
const sendCsv = (res, csv, generatedAt, truncated) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="flussio_report_advanced_${generatedAt.slice(0, 10)}.csv"`);
  if (truncated != null) {
    res.setHeader('X-Report-Generated-At', generatedAt);
    res.setHeader('X-Report-Truncated', String(truncated));
  }
  return res.status(200).send(csv);
};

router.post('/run', async (req, res) => {
  try {
    const spec = normalize(req.body, req.companyId);
    const result = await reportWork(req, spec, async client => {
      if (spec.reportKind !== 'standard') return { spec, ...await runSpecialReport(client, spec), generated_at: new Date().toISOString() };
      const aggregate = buildAdvancedReportQuery(spec, { sentinel: true });
      const totalsQuery = buildTotalsQuery(spec);
      const rowsResult = await client.query(aggregate.text, aggregate.values);
      const totalsResult = await client.query(totalsQuery.text, totalsQuery.values);
      const rows = rowsResult.rows.slice(0, spec.limit);
      const totals = totalsResult.rows[0] || { income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0, count: 0 };
      const truncated = rowsResult.rows.length > spec.limit;
      const reconciliation = truncated ? null : Object.fromEntries(spec.metrics
        .filter(metric => ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents'].includes(metric))
        .map(metric => [metric, (rows.reduce((sum, row) => sum + BigInt(row[metric] || 0), 0n) - BigInt(totals[metric] || 0)).toString()]));
      return { spec, rows: spec.groupBy.length === 0 && rows.length === 0 ? [totals] : rows, totals, truncated, reconciliation,
        generated_at: new Date().toISOString(), amount_basis: spec.filters.accountId != null || spec.groupBy.includes('account') ? 'account_allocations' : 'movements' };
    });
    // Cache writes occur only after commit, outside any retried transaction.
    return res.json({ ...result, export_snapshot: permission(req, 'export') ? reportSnapshots.put(req.companyId, req.user.user_id, result) : null });
  } catch (error) { return sendModuleError(res, error); }
});

router.post('/export.csv', requirePermission('export'), async (req, res) => {
  try {
    if (Object.hasOwn(req.body || {}, 'snapshot_id')) {
      const snapshot = typeof req.body.snapshot_id === 'string' && reportSnapshots.get(req.body.snapshot_id, req.companyId, req.user.user_id);
      if (!snapshot) throw fail('REPORT_SNAPSHOT_EXPIRED', 410);
      // Frozen data do not freeze permissions. Client spec/capabilities are ignored.
      await withCompanyReport(req.companyId, snapshot.capabilities, async () => {}, { action: 'export', permissionGranted: permission(req, 'export') });
      return sendCsv(res, snapshot.csv, snapshot.generatedAt, snapshot.truncated);
    }
    const spec = normalize(req.body, req.companyId);
    const csv = await reportWork(req, spec, async client => {
      if (spec.reportKind !== 'standard') return toCsv((await runSpecialReport(client, spec)).rows);
      const aggregate = buildAdvancedReportQuery(spec);
      return toCsv((await client.query(aggregate.text, aggregate.values)).rows);
    }, 'export');
    return sendCsv(res, csv, new Date().toISOString());
  } catch (error) { return sendModuleError(res, error); }
});

router.get('/saved', async (req, res) => {
  try {
    const rows = await withCompanyReport(req.companyId, ['general_reports'], async (client, current) => {
      const result = await client.query(`SELECT id, name, spec_json, is_shared, created_at, updated_at, created_by_user_id
        FROM saved_reports WHERE company_id=$1 AND (is_shared=true OR created_by_user_id=$2) ORDER BY updated_at DESC, id DESC`, [req.companyId, req.user.user_id]);
      return result.rows.map(row => {
        const spec = validateAndNormalizeSpec(row.spec_json, req.companyId);
        const access = spec.error ? { allowed: false, code: spec.error.code }
          : modulePolicy.evaluate({ states: current.states, capabilities: reportCapabilities(spec), action: 'read', permissionGranted: permission(req, 'read') });
        return { ...row, spec_json: access.allowed ? spec : null, module_access: access };
      });
    }, { permissionGranted: permission(req, 'read') });
    return res.json(rows);
  } catch (error) { return missingSavedTable(error) ? res.json([]) : sendModuleError(res, error); }
});

router.post('/saved', requirePermission('export'), async (req, res) => {
  try {
    const { name, is_shared: shared } = req.body || {};
    const spec = normalize(req.body?.spec_json, req.companyId);
    if (typeof name !== 'string' || !name.trim()) throw fail('VALIDATION_MISSING_FIELDS');
    const result = await reportWork(req, spec, client => client.query(`INSERT INTO saved_reports(company_id,name,spec_json,created_by_user_id,is_shared)
      VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id,name,is_shared,created_at,updated_at,created_by_user_id`,
    [req.companyId, name.trim(), JSON.stringify(spec), req.user.user_id, Boolean(shared)]), 'write');
    return res.status(201).json(result.rows[0]);
  } catch (error) { return savedError(res, error); }
});

router.put('/saved/:id', requirePermission('export'), async (req, res) => {
  try {
    const { name, is_shared: shared } = req.body || {};
    const spec = normalize(req.body?.spec_json, req.companyId);
    if (!validSavedId(req.params.id) || typeof name !== 'string' || !name.trim()) throw fail('VALIDATION_MISSING_FIELDS');
    const result = await withCompanyReport(req.companyId, ['general_reports'], async (client, current) => {
      const existing = await client.query('SELECT id,created_by_user_id,spec_json FROM saved_reports WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, req.companyId]);
      if (!existing.rowCount) throw fail('NOT_FOUND', 404);
      const old = existing.rows[0];
      if (!canEditSaved(req, old)) throw fail('FORBIDDEN', 403);
      assertModuleAccess(current.states, reportCapabilities(normalize(old.spec_json, req.companyId)), 'write', { permissionGranted: permission(req, 'export') });
      assertModuleAccess(current.states, reportCapabilities(spec), 'write', { permissionGranted: permission(req, 'export') });
      return client.query(`UPDATE saved_reports SET name=$1,spec_json=$2::jsonb,is_shared=$3,updated_at=NOW()
        WHERE id=$4 AND company_id=$5 RETURNING id,name,is_shared,created_at,updated_at,created_by_user_id`,
      [name.trim(), JSON.stringify(spec), Boolean(shared), req.params.id, req.companyId]);
    }, { action: 'write', permissionGranted: permission(req, 'export') });
    return res.json(result.rows[0]);
  } catch (error) { return savedError(res, error); }
});

router.delete('/saved/:id', requirePermission('export'), async (req, res) => {
  try {
    if (!validSavedId(req.params.id)) throw fail('VALIDATION_MISSING_FIELDS');
    await withCompanyReport(req.companyId, ['general_reports'], async (client, current) => {
      const existing = await client.query('SELECT id,created_by_user_id,spec_json FROM saved_reports WHERE id=$1 AND company_id=$2 FOR UPDATE', [req.params.id, req.companyId]);
      if (!existing.rowCount) throw fail('NOT_FOUND', 404);
      if (!canEditSaved(req, existing.rows[0])) throw fail('FORBIDDEN', 403);
      const spec = normalize(existing.rows[0].spec_json, req.companyId);
      assertModuleAccess(current.states, reportCapabilities(spec), 'delete', { permissionGranted: permission(req, 'export') });
      await client.query('DELETE FROM saved_reports WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    }, { action: 'delete', permissionGranted: permission(req, 'export') });
    return res.status(204).send();
  } catch (error) { return savedError(res, error); }
});

export default router;
