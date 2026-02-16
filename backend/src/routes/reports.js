import express from 'express';
import { query } from '../db/index.js';

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
      return { error: true };
    }
    params.push(dateFrom);
    clauses.push(`t.date >= $${params.length + 2}`);
  }

  if (dateTo) {
    if (!isoDateRegex.test(dateTo)) {
      return { error: true };
    }
    params.push(dateTo);
    clauses.push(`t.date <= $${params.length + 2}`);
  }

  return { clauses, params };
};

const getJobForCompany = async (jobId, companyId) => {
  const jobResult = await query(
    `
    SELECT id, code, title
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
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const dateFilters = buildDateFilters(req.query.date_from, req.query.date_to);
  if (dateFilters.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const job = await getJobForCompany(jobId, req.user.company_id);
    if (!job) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
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
      [req.user.company_id, jobId, ...dateFilters.params]
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
      [req.user.company_id, jobId, ...dateFilters.params]
    );

    const incomeCents = Number(totalsResult.rows[0]?.income_cents || 0);
    const expenseCents = Number(totalsResult.rows[0]?.expense_cents || 0);

    return res.json({
      job,
      totals: {
        income_cents: incomeCents,
        expense_cents: expenseCents,
        margin_cents: incomeCents - expenseCents,
      },
      by_category: breakdownResult.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.get('/job/:jobId/export.csv', async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const dateFilters = buildDateFilters(req.query.date_from, req.query.date_to);
  if (dateFilters.error) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const job = await getJobForCompany(jobId, req.user.company_id);
    if (!job) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
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
      [req.user.company_id, jobId, ...dateFilters.params]
    );

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

    const csvContent = `${header}\n${lines.join('\n')}`;
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
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
