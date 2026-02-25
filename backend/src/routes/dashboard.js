import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

const allowedKinds = new Set(['income', 'expense']);
const allowedDimensions = new Set(['category', 'contact', 'account', 'job']);

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const toIsoDate = (date) => date.toISOString().slice(0, 10);
const monthLabel = (date) => `${date.toLocaleString('it-IT', { month: 'short' })} ${date.getFullYear()}`;

const getPeriodRange = (period) => {
  const now = new Date();
  const end = new Date(now);

  if (period === 'last30days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }

  if (period === 'currentmonth') {
    return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(end) };
  }

  if (period === 'currentyear') {
    return { from: toIsoDate(new Date(now.getFullYear(), 0, 1)), to: toIsoDate(end) };
  }

  const sixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return { from: toIsoDate(sixMonths), to: toIsoDate(end) };
};

const getDateRangeFromQuery = (input = {}) => {
  const { from, to, period = 'last6months' } = input;

  if (from || to) {
    if ((from && !isoDateRegex.test(from)) || (to && !isoDateRegex.test(to))) {
      return { error: true };
    }
    const fallback = getPeriodRange(period);
    const resolvedFrom = from || fallback.from;
    const resolvedTo = to || fallback.to;
    if (resolvedFrom > resolvedTo) return { error: true };
    return { from: resolvedFrom, to: resolvedTo };
  }

  return getPeriodRange(period);
};

const countInclusiveDays = (range) => {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
};

const shiftRangeByDays = (range, deltaDays) => {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  from.setDate(from.getDate() + deltaDays);
  to.setDate(to.getDate() + deltaDays);
  return { from: toIsoDate(from), to: toIsoDate(to) };
};

const buildBuckets = (range, period) => {
  const start = new Date(`${range.from}T00:00:00`);
  const end = new Date(`${range.to}T00:00:00`);
  const buckets = [];
  const twoDigits = (value) => String(value).padStart(2, '0');

  if (period === 'last30days' || period === 'currentmonth') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
      buckets.push({ key, label: `${twoDigits(d.getDate())}/${twoDigits(d.getMonth() + 1)}` });
    }
    return { granularity: 'day', buckets };
  }

  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}`;
    buckets.push({ key, label: monthLabel(d) });
  }
  return { granularity: 'month', buckets };
};

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
        [req.user.company_id, range.from, range.to]
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
        [req.user.company_id, previousRange.from, previousRange.to]
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
      [req.user.company_id, range.from, range.to]
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
      joins: 'LEFT JOIN categories c ON c.id = t.category_id',
    },
    contact: {
      id: 't.contact_id',
      label: "COALESCE(ct.name, 'Non assegnato')",
      joins: 'LEFT JOIN contacts ct ON ct.id = t.contact_id',
    },
    job: {
      id: 't.job_id',
      label: "COALESCE(j.title, j.name, 'Non assegnato')",
      joins: 'LEFT JOIN jobs j ON j.id = t.job_id',
    },
    account: {
      id: 'a.id',
      label: "COALESCE(a.name, 'Non assegnato')",
      joins: `
        LEFT JOIN LATERAL (
          SELECT acc.id, acc.name
          FROM transaction_accounts ta
          JOIN accounts acc ON acc.id = ta.account_id
          WHERE ta.transaction_id = t.id
          ORDER BY ta.id
          LIMIT 1
        ) a ON true
      `,
    },
  }[dimension];

  try {
    const result = await query(
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
      [req.user.company_id, range.from, range.to, kind]
    );

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
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
