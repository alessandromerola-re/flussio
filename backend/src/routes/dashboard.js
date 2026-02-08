import express from 'express';
import { query } from '../db/index.js';

const router = express.Router();

const getPeriodRange = (period) => {
  const now = new Date();
  if (period === 'currentyear') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start, end: now };
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return { start, end: now };
};

router.get('/summary', async (req, res) => {
  const { period = 'last6months' } = req.query;
  const { start, end } = getPeriodRange(period);
  try {
    const result = await query(
      `
      SELECT
        SUM(CASE WHEN type = 'income' THEN amount_total ELSE 0 END) AS income_total,
        SUM(CASE WHEN type = 'expense' THEN amount_total ELSE 0 END) AS expense_total
      FROM transactions
      WHERE company_id = $1 AND date BETWEEN $2 AND $3
      `,
      [req.user.company_id, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );

    const income = Number(result.rows[0].income_total || 0);
    const expense = Number(result.rows[0].expense_total || 0);

    return res.json({
      income_total: income,
      expense_total: expense,
      net: income - expense,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.get('/cashflow', async (req, res) => {
  const { period = 'last6months' } = req.query;
  const { start, end } = getPeriodRange(period);
  try {
    const result = await query(
      `
      SELECT
        to_char(date_trunc('month', date), 'YYYY-MM') AS month,
        SUM(CASE WHEN type = 'income' THEN amount_total ELSE 0 END) AS income,
        SUM(CASE WHEN type = 'expense' THEN amount_total ELSE 0 END) AS expense
      FROM transactions
      WHERE company_id = $1 AND date BETWEEN $2 AND $3
      GROUP BY month
      ORDER BY month
      `,
      [req.user.company_id, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.get('/top-categories', async (req, res) => {
  const { period = 'last6months', direction = 'expense' } = req.query;
  const { start, end } = getPeriodRange(period);
  try {
    const result = await query(
      `
      SELECT c.name, SUM(t.amount_total) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.company_id = $1 AND t.type = $2 AND t.date BETWEEN $3 AND $4
      GROUP BY c.name
      ORDER BY total DESC
      LIMIT 5
      `,
      [req.user.company_id, direction, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
