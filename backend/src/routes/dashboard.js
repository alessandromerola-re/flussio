import express from 'express';
import { getDateRangeFromQuery, countInclusiveDays, shiftRangeByDays, buildBuckets } from '../utils/dashboardDates.js';
import { withCompanyReport } from '../modules/reportAccess.js';
import { sendModuleError } from '../modules/access.js';
import { canRole, getRole } from '../middleware/permissions.js';
import { query } from '../db/index.js';

const router = express.Router();

const allowedKinds = new Set(['income', 'expense']);
const allowedDimensions = new Set(['category', 'contact', 'account', 'job']);

router.get('/summary', async (req, res) => {
  const period = req.query.period || 'last6months';
  const range = getDateRangeFromQuery({ ...req.query, period });
  if (range.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const previousRange = shiftRangeByDays(range, -countInclusiveDays(range));

    const [summaryResult, previousSummaryResult] = await Promise.all([
      query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN t.type = 'income' THEN ROUND(t.amount_total * 100)::bigint ELSE 0 END),0)::bigint AS income_sum_cents,
          COALESCE(SUM(CASE WHEN t.type = 'expense' THEN ABS(ROUND(t.amount_total * 100)::bigint) ELSE 0 END),0)::bigint AS expense_sum_cents,
          COUNT(*)::int AS count
        FROM transactions t
        WHERE t.company_id = $1
          AND t.date BETWEEN $2 AND $3
        `,
        [req.companyId, range.from, range.to]
      ),
      query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN t.type = 'income' THEN ROUND(t.amount_total * 100)::bigint ELSE 0 END),0)::bigint AS income_sum_cents,
          COALESCE(SUM(CASE WHEN t.type = 'expense' THEN ABS(ROUND(t.amount_total * 100)::bigint) ELSE 0 END),0)::bigint AS expense_sum_cents,
          COUNT(*)::int AS count
        FROM transactions t
        WHERE t.company_id = $1
          AND t.date BETWEEN $2 AND $3
        `,
        [req.companyId, previousRange.from, previousRange.to]
      ),
    ]);

    const { granularity, buckets } = buildBuckets(range, period);
    const bucketExpr = granularity === 'day'
      ? "to_char(t.date, 'YYYY-MM-DD')"
      : "to_char(date_trunc('month', t.date), 'YYYY-MM')";

    const byBucketResult = await query(
      `
      SELECT
        ${bucketExpr} AS bucket,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN ROUND(t.amount_total * 100)::bigint ELSE 0 END),0)::bigint AS income_sum_cents,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN ABS(ROUND(t.amount_total * 100)::bigint) ELSE 0 END),0)::bigint AS expense_sum_cents
      FROM transactions t
      WHERE t.company_id = $1
        AND t.date BETWEEN $2 AND $3
      GROUP BY 1
      ORDER BY 1
      `,
      [req.companyId, range.from, range.to]
    );

    const byBucketMap = new Map(byBucketResult.rows.map((row) => [row.bucket, row]));

    const byBucket = buckets.map((bucket) => {
      const row = byBucketMap.get(bucket.key);
      const incomeBucket = Number(row?.income_sum_cents || 0);
      const expenseBucket = Number(row?.expense_sum_cents || 0);
      return {
        bucket: bucket.key,
        label: bucket.label,
        income_sum_cents: incomeBucket,
        expense_sum_cents: expenseBucket,
        net_sum_cents: incomeBucket - expenseBucket,
      };
    });

    const base = summaryResult.rows[0] || { income_sum_cents: 0, expense_sum_cents: 0, count: 0 };
    const prev = previousSummaryResult.rows[0] || { income_sum_cents: 0, expense_sum_cents: 0, count: 0 };

    const income = Number(base.income_sum_cents || 0);
    const expense = Number(base.expense_sum_cents || 0);
    const prevIncome = Number(prev.income_sum_cents || 0);
    const prevExpense = Number(prev.expense_sum_cents || 0);

    return res.json({
      income_sum_cents: income,
      expense_sum_cents: expense,
      net_sum_cents: income - expense,
      count: Number(base.count || 0),
      previous: {
        from: previousRange.from,
        to: previousRange.to,
        income_sum_cents: prevIncome,
        expense_sum_cents: prevExpense,
        net_sum_cents: prevIncome - prevExpense,
        count: Number(prev.count || 0),
      },
      by_bucket: byBucket,
      by_month: byBucket
        .filter((row) => row.bucket.length === 7)
        .map((row) => ({
          month: row.bucket,
          income_sum_cents: row.income_sum_cents,
          expense_sum_cents: row.expense_sum_cents,
          net_sum_cents: row.net_sum_cents,
        })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/pie', async (req, res) => {
  const range = getDateRangeFromQuery(req.body || {});
  if (range.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const kind = String(req.body?.kind || 'expense');
  const dimension = String(req.body?.dimension || 'category');
  const topN = Math.min(Math.max(Number(req.body?.topN || 12), 1), 30);

  if (!allowedKinds.has(kind) || !allowedDimensions.has(dimension)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const dimensionSelect = {
    category: {
      id: 't.category_id',
      label: "COALESCE(c.name, 'Non assegnato')",
      joins: 'LEFT JOIN categories c ON c.id = t.category_id AND c.company_id = t.company_id',
    },
    contact: {
      id: 't.contact_id',
      label: "COALESCE(ct.name, 'Non assegnato')",
      joins: 'LEFT JOIN contacts ct ON ct.id = t.contact_id AND ct.company_id = t.company_id',
    },
    job: {
      id: 't.job_id',
      label: "COALESCE(j.title, j.name, 'Non assegnato')",
      joins: 'LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = t.company_id',
    },
    account: {
      id: 'a.id',
      label: "COALESCE(a.name, 'Non assegnato')",
      joins: `
        LEFT JOIN LATERAL (
          SELECT acc.id, acc.name
          FROM transaction_accounts ta
          JOIN accounts acc ON acc.id = ta.account_id
          WHERE ta.transaction_id = t.id AND acc.company_id = t.company_id
          ORDER BY ta.id
          LIMIT 1
        ) a ON true
      `,
    },
  }[dimension];

  try {
    const result = await withCompanyReport(req.companyId, dimension === 'job' ? ['general_reports', 'job_reports'] : ['general_reports'], client => client.query(
      `
      SELECT
        ${dimensionSelect.id} AS id,
        ${dimensionSelect.label} AS label,
        COALESCE(SUM(${kind === 'expense' ? "ABS(ROUND(t.amount_total * 100)::bigint)" : "ROUND(t.amount_total * 100)::bigint"}),0)::bigint AS value_cents,
        COUNT(*)::int AS count
      FROM transactions t
      ${dimensionSelect.joins}
      WHERE t.company_id = $1
        AND t.date BETWEEN $2 AND $3
        AND t.type = $4
      GROUP BY 1, 2
      ORDER BY value_cents DESC
      `,
      [req.companyId, range.from, range.to, kind]
    ), { permissionGranted: canRole(getRole(req), 'read') });

    const allRows = result.rows.map((row) => ({
      id: row.id,
      label: row.label,
      value_cents: Number(row.value_cents || 0),
      count: Number(row.count || 0),
    }));

    const slices = allRows.slice(0, topN);
    const others_cents = allRows.slice(topN).reduce((acc, row) => acc + row.value_cents, 0);
    const total_cents = allRows.reduce((acc, row) => acc + row.value_cents, 0);

    return res.json({ kind, dimension, total_cents, slices, others_cents });
  } catch (error) {
    return sendModuleError(res, error);
  }
});

export default router;
