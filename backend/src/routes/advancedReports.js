import express from 'express';
import { query } from '../db/index.js';
import { requirePermission, getRole } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';
import { buildAdvancedReportQuery, buildTotalsQuery, toCsv, validateAndNormalizeSpec } from '../services/advancedReports.js';

const router = express.Router();


const isSavedReportsTableMissing = (error) => error?.code === '42P01';

router.post('/run', async (req, res) => {
  const normalized = validateAndNormalizeSpec(req.body, req.companyId);
  if (normalized.error) {
    return sendError(res, 400, normalized.error.code, 'Spec report non valida.', { field: normalized.error.field });
  }

  try {
    const aggregate = buildAdvancedReportQuery(normalized);
    const totals = buildTotalsQuery(normalized);

    const [rowsResult, totalsResult] = await Promise.all([
      query(aggregate.text, aggregate.values),
      query(totals.text, totals.values),
    ]);

    const rows = rowsResult.rows;
    const totalsRow = totalsResult.rows[0] || { income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0, count: 0 };

    return res.json({
      spec: normalized,
      rows: normalized.groupBy.length === 0 && rows.length === 0 ? [totalsRow] : rows,
      totals: totalsRow,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/export.csv', requirePermission('export'), async (req, res) => {
  const normalized = validateAndNormalizeSpec(req.body, req.companyId);
  if (normalized.error) {
    return sendError(res, 400, normalized.error.code, 'Spec report non valida.', { field: normalized.error.field });
  }

  try {
    const aggregate = buildAdvancedReportQuery(normalized);
    const rowsResult = await query(aggregate.text, aggregate.values);
    const csv = toCsv(rowsResult.rows);

    const datePart = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flussio_report_advanced_${datePart}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/saved', async (req, res) => {
  try {
    const result = await query(
      `
      SELECT id, name, spec_json, is_shared, created_at, updated_at, created_by_user_id
      FROM saved_reports
      WHERE company_id = $1
        AND (is_shared = true OR created_by_user_id = $2)
      ORDER BY updated_at DESC, id DESC
      `,
      [req.companyId, req.user.user_id]
    );
    return res.json(result.rows);
  } catch (error) {
    if (isSavedReportsTableMissing(error)) {
      return res.json([]);
    }
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.post('/saved', requirePermission('export'), async (req, res) => {
  const { name, is_shared: isSharedInput } = req.body || {};
  const normalized = validateAndNormalizeSpec(req.body?.spec_json, req.companyId);
  if (!name || typeof name !== 'string' || normalized.error) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Dati report non validi.');
  }

  try {
    const result = await query(
      `
      INSERT INTO saved_reports (company_id, name, spec_json, created_by_user_id, is_shared)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      RETURNING id, name, is_shared, created_at, updated_at, created_by_user_id
      `,
      [req.companyId, name.trim(), JSON.stringify(normalized), req.user.user_id, Boolean(isSharedInput)]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isSavedReportsTableMissing(error)) {
      return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Migrazione report salvati non applicata.');
    }
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.put('/saved/:id', requirePermission('export'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, is_shared: isSharedInput } = req.body || {};
  const normalized = validateAndNormalizeSpec(req.body?.spec_json, req.companyId);
  if (!Number.isInteger(id) || !name || typeof name !== 'string' || normalized.error) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Dati report non validi.');
  }

  try {
    const existing = await query(
      'SELECT id, created_by_user_id FROM saved_reports WHERE id = $1 AND company_id = $2 LIMIT 1',
      [id, req.companyId]
    );

    if (!existing.rowCount) {
      return sendError(res, 404, 'NOT_FOUND', 'Report non trovato.');
    }

    const role = getRole(req);
    const isOwner = existing.rows[0].created_by_user_id === req.user.user_id;
    if (!isOwner && role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Operazione non consentita.');
    }

    const result = await query(
      `
      UPDATE saved_reports
      SET name = $1,
          spec_json = $2::jsonb,
          is_shared = $3,
          updated_at = NOW()
      WHERE id = $4 AND company_id = $5
      RETURNING id, name, is_shared, created_at, updated_at, created_by_user_id
      `,
      [name.trim(), JSON.stringify(normalized), Boolean(isSharedInput), id, req.companyId]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    if (isSavedReportsTableMissing(error)) {
      return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Migrazione report salvati non applicata.');
    }
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.delete('/saved/:id', requirePermission('export'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Parametri non validi.');
  }

  try {
    const existing = await query(
      'SELECT id, created_by_user_id FROM saved_reports WHERE id = $1 AND company_id = $2 LIMIT 1',
      [id, req.companyId]
    );

    if (!existing.rowCount) {
      return sendError(res, 404, 'NOT_FOUND', 'Report non trovato.');
    }

    const role = getRole(req);
    const isOwner = existing.rows[0].created_by_user_id === req.user.user_id;
    if (!isOwner && role !== 'admin') {
      return sendError(res, 403, 'FORBIDDEN', 'Operazione non consentita.');
    }

    await query('DELETE FROM saved_reports WHERE id = $1 AND company_id = $2', [id, req.companyId]);
    return res.status(204).send();
  } catch (error) {
    if (isSavedReportsTableMissing(error)) {
      return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Migrazione report salvati non applicata.');
    }
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

export default router;
