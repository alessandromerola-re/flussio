import express from 'express';
import { query } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';
import { sendError } from '../utils/httpErrors.js';

const router = express.Router();
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const csvEscape = (value) => {
  const stringValue = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const buildDateFilters = (dateFrom, dateTo) => {
  const clauses = [];
  const params = [];

  if (dateFrom) {
    if (!isoDateRegex.test(dateFrom)) {
      return { error: { code: 'VALIDATION_INVALID_DATE_FORMAT', field: 'date_from' } };
    }
    params.push(dateFrom);
    clauses.push(`t.date >= $${params.length + 2}`);
  }

  if (dateTo) {
    if (!isoDateRegex.test(dateTo)) {
      return { error: { code: 'VALIDATION_INVALID_DATE_FORMAT', field: 'date_to' } };
    }
    params.push(dateTo);
    clauses.push(`t.date <= $${params.length + 2}`);
  }

  if (dateFrom && dateTo && dateTo < dateFrom) {
    return { error: { code: 'VALIDATION_INVALID_DATE_RANGE', field: 'date_to' } };
  }

  return { clauses, params };
};


const safePct = (numerator, denominator) => {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  if (!Number.isFinite(numerator)) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
};

const buildEconomicSummary = (job, incomeCents, expenseCents) => {
  const expectedRevenueCents = job.expected_revenue_cents == null ? null : Number(job.expected_revenue_cents);
  const expectedCostCents = job.expected_cost_cents == null ? null : Number(job.expected_cost_cents);
  const expectedMarginCents =
    expectedRevenueCents == null || expectedCostCents == null ? null : expectedRevenueCents - expectedCostCents;
  const actualMarginCents = incomeCents - expenseCents;

  return {
    expectedRevenueCents,
    expectedCostCents,
    expectedMarginCents,
    totalIncomeCents: incomeCents,
    totalExpenseCents: expenseCents,
    actualMarginCents,
    revenueVarianceCents: expectedRevenueCents == null ? null : incomeCents - expectedRevenueCents,
    costVarianceCents: expectedCostCents == null ? null : expenseCents - expectedCostCents,
    marginVarianceCents: expectedMarginCents == null ? null : actualMarginCents - expectedMarginCents,
    revenueCompletionPct: expectedRevenueCents == null ? null : safePct(incomeCents, expectedRevenueCents),
    costConsumptionPct: expectedCostCents == null ? null : safePct(expenseCents, expectedCostCents),
    marginVsTargetPct:
      expectedMarginCents == null || expectedMarginCents <= 0 ? null : safePct(actualMarginCents, expectedMarginCents),
  };
};

const getJobForCompany = async (jobId, companyId) => {
  const jobResult = await query(
    `
    SELECT id, code, title, expected_revenue_cents, expected_cost_cents
    FROM jobs
    WHERE id = $1
      AND company_id = $2
    LIMIT 1
    `,
    [jobId, companyId]
  );

  return jobResult.rows[0] || null;
};

router.get('/job/:jobId/summary', async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Parametri report non validi.');
  }

  const dateFilters = buildDateFilters(req.query.date_from, req.query.date_to);
  if (dateFilters.error) {
    return sendError(res, 400, dateFilters.error.code, 'Filtro date non valido.', { field: dateFilters.error.field });
  }

  try {
    const job = await getJobForCompany(jobId, req.companyId);
    if (!job) {
      return sendError(res, 404, 'JOB_NOT_FOUND', 'Commessa non trovata.');
    }

    const whereDateSql = dateFilters.clauses.length ? ` AND ${dateFilters.clauses.join(' AND ')}` : '';

    const totalsResult = await query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN ROUND(t.amount_total * 100)::bigint ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN ABS(ROUND(t.amount_total * 100)::bigint) ELSE 0 END), 0) AS expense_cents
      FROM transactions t
      WHERE t.company_id = $1
        AND t.job_id = $2
        AND t.type IN ('income', 'expense')
        ${whereDateSql}
      `,
      [req.companyId, jobId, ...dateFilters.params]
    );

    const breakdownResult = await query(
      `
      SELECT
        t.category_id,
        COALESCE(c.name, 'Senza categoria') AS category_name,
        COALESCE(c.direction, CASE WHEN t.type = 'income' THEN 'income' ELSE 'expense' END) AS direction,
        COALESCE(SUM(ABS(ROUND(t.amount_total * 100)::bigint)), 0) AS amount_cents
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.company_id = $1
        AND t.job_id = $2
        AND t.type IN ('income', 'expense')
        ${whereDateSql}
      GROUP BY t.category_id, c.name, c.direction, t.type
      ORDER BY direction, category_name
      `,
      [req.companyId, jobId, ...dateFilters.params]
    );

    const incomeCents = Number(totalsResult.rows[0]?.income_cents || 0);
    const expenseCents = Number(totalsResult.rows[0]?.expense_cents || 0);

    const economicSummary = buildEconomicSummary(job, incomeCents, expenseCents);

    return res.json({
      job: {
        id: job.id,
        code: job.code,
        title: job.title,
      },
      totals: {
        income_cents: incomeCents,
        expense_cents: expenseCents,
        margin_cents: incomeCents - expenseCents,
      },
      expected: {
        revenue_cents: economicSummary.expectedRevenueCents,
        cost_cents: economicSummary.expectedCostCents,
        margin_cents: economicSummary.expectedMarginCents,
      },
      variances: {
        revenue_cents: economicSummary.revenueVarianceCents,
        cost_cents: economicSummary.costVarianceCents,
        margin_cents: economicSummary.marginVarianceCents,
      },
      percentages: {
        revenue_completion_pct: economicSummary.revenueCompletionPct,
        cost_consumption_pct: economicSummary.costConsumptionPct,
        margin_vs_target_pct: economicSummary.marginVsTargetPct,
      },
      by_category: breakdownResult.rows,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

router.get('/job/:jobId/export.csv', requirePermission('export'), async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Parametri report non validi.');
  }

  const dateFilters = buildDateFilters(req.query.date_from, req.query.date_to);
  if (dateFilters.error) {
    return sendError(res, 400, dateFilters.error.code, 'Filtro date non valido.', { field: dateFilters.error.field });
  }

  try {
    const job = await getJobForCompany(jobId, req.companyId);
    if (!job) {
      return sendError(res, 404, 'JOB_NOT_FOUND', 'Commessa non trovata.');
    }

    const whereDateSql = dateFilters.clauses.length ? ` AND ${dateFilters.clauses.join(' AND ')}` : '';

    const rowsResult = await query(
      `
      SELECT
        t.date,
        t.type,
        t.amount_total,
        COALESCE(a.name, '') AS account_name,
        COALESCE(c.name, '') AS category_name,
        COALESCE(ct.name, '') AS contact_name,
        COALESCE(j.title, '') AS job_title,
        COALESCE(t.description, '') AS description
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id
      LEFT JOIN jobs j ON j.id = t.job_id
      LEFT JOIN LATERAL (
        SELECT acc.name
        FROM transaction_accounts ta
        JOIN accounts acc ON acc.id = ta.account_id
        WHERE ta.transaction_id = t.id
        ORDER BY ta.id
        LIMIT 1
      ) a ON true
      WHERE t.company_id = $1
        AND t.job_id = $2
        ${whereDateSql}
      ORDER BY t.date DESC, t.id DESC
      `,
      [req.companyId, jobId, ...dateFilters.params]
    );

    const totalsResult = await query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN ROUND(t.amount_total * 100)::bigint ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN ABS(ROUND(t.amount_total * 100)::bigint) ELSE 0 END), 0) AS expense_cents
      FROM transactions t
      WHERE t.company_id = $1
        AND t.job_id = $2
        AND t.type IN ('income', 'expense')
        ${whereDateSql}
      `,
      [req.companyId, jobId, ...dateFilters.params]
    );

    const incomeCents = Number(totalsResult.rows[0]?.income_cents || 0);
    const expenseCents = Number(totalsResult.rows[0]?.expense_cents || 0);
    const economicSummary = buildEconomicSummary(job, incomeCents, expenseCents);

    const header = 'date;type;amount_total;account_name;category;contact;commessa;description';
    const lines = rowsResult.rows.map((row) =>
      [
        csvEscape(row.date),
        csvEscape(row.type),
        csvEscape(row.amount_total),
        csvEscape(row.account_name),
        csvEscape(row.category_name),
        csvEscape(row.contact_name),
        csvEscape(row.job_title),
        csvEscape(row.description),
      ].join(';')
    );

    const summaryRows = [
      ['meta', 'ricavi_previsti_cents', economicSummary.expectedRevenueCents],
      ['meta', 'costi_previsti_cents', economicSummary.expectedCostCents],
      ['meta', 'margine_previsto_cents', economicSummary.expectedMarginCents],
      ['meta', 'totale_entrate_cents', economicSummary.totalIncomeCents],
      ['meta', 'totale_uscite_cents', economicSummary.totalExpenseCents],
      ['meta', 'margine_reale_cents', economicSummary.actualMarginCents],
      ['meta', 'scostamento_ricavi_cents', economicSummary.revenueVarianceCents],
      ['meta', 'scostamento_costi_cents', economicSummary.costVarianceCents],
      ['meta', 'scostamento_margine_cents', economicSummary.marginVarianceCents],
    ].map((row) => row.map(csvEscape).join(';'));

    const csvContent = `${summaryRows.join('\n')}\n\n${header}\n${lines.join('\n')}`;
    const datePart = new Date().toISOString().slice(0, 10);
    const codePart = job.code ? `_${job.code}` : '';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="flussio_commessa_${job.id}${codePart}_${datePart}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Errore server.');
  }
});

export default router;
