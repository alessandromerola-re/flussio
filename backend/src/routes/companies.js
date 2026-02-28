import express from 'express';
import { getClient, query } from '../db/index.js';
import { sendError } from '../utils/httpErrors.js';
import { writeAuditLog } from '../services/audit.js';

const router = express.Router();

const requireSuperAdmin = (req, res) => {
  if (req.user?.is_super_admin !== true) {
    sendError(res, 403, 'FORBIDDEN', 'Operation not allowed.');
    return false;
  }
  return true;
};

router.get('/', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;

  try {
    const result = await query('SELECT id, name, created_at FROM companies ORDER BY name');
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Internal server error.');
  }
});

router.post('/', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;

  const { name, seed_defaults } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Name is required.');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const companyResult = await client.query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id, name, created_at',
      [name.trim()]
    );
    const company = companyResult.rows[0];
    const shouldSeedDefaults = seed_defaults === true;

    if (shouldSeedDefaults) {
      await client.query(
        `INSERT INTO accounts (company_id, name, external_id, type, opening_balance, balance, is_active)
         VALUES
           ($1, 'Cassa', 'cassa', 'cash', 0, 0, true),
           ($1, 'Banca', 'banca', 'bank', 0, 0, true),
           ($1, 'Carta', 'carta', 'card', 0, 0, true)
         ON CONFLICT DO NOTHING`,
        [company.id]
      );

      await client.query(
        `INSERT INTO categories (company_id, name, external_id, direction, color, is_active)
         VALUES
           ($1, 'Vendite', 'vendite_income', 'income', '#2ecc71', true),
           ($1, 'Servizi', 'servizi_income', 'income', '#27ae60', true),
           ($1, 'Affitto', 'affitto_expense', 'expense', '#e74c3c', true),
           ($1, 'Utenze', 'utenze_expense', 'expense', '#c0392b', true)
         ON CONFLICT DO NOTHING`,
        [company.id]
      );
    }

    try {
      await client.query(
        `INSERT INTO user_companies (user_id, company_id, role, is_active)
         VALUES ($1, $2, 'admin', true)
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        [req.user.user_id, company.id]
      );
    } catch (membershipError) {
      if (membershipError?.code !== '42P01') {
        throw membershipError;
      }
    }

    await writeAuditLog({
      client,
      companyId: company.id,
      userId: req.user.user_id,
      action: 'company_create',
      entityType: 'company',
      entityId: company.id,
      meta: { seed_defaults: shouldSeedDefaults },
    });

    await client.query('COMMIT');
    return res.status(201).json({ company, seeded: shouldSeedDefaults });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Internal server error.');
  } finally {
    client.release();
  }
});

export default router;
