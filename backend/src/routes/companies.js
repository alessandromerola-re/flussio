import { previewCompanyModules, readModuleEvents } from '../modules/management.js';
import { readCompanyModules } from '../modules/registry.js';
import { companyContextMiddleware } from '../middleware/companyContext.js';
import express from 'express';
import { getClient, query } from '../db/index.js';
import { sendError } from '../utils/httpErrors.js';
import { writeAuditLog } from '../services/audit.js';

const router = express.Router();

const isMissingColumnError = (error, columnName) =>
  error?.code === '42703' && String(error?.message || '').includes(columnName);

const seedDefaultRecords = async (client, companyId) => {
  try {
    await client.query(
      `INSERT INTO accounts (company_id, name, external_id, type, opening_balance, balance, is_active)
       VALUES
         ($1, 'Cassa', 'cassa', 'cash', 0, 0, true),
         ($1, 'Banca', 'banca', 'bank', 0, 0, true),
         ($1, 'Carta', 'carta', 'card', 0, 0, true)
       ON CONFLICT DO NOTHING`,
      [companyId]
    );

    await client.query(
      `INSERT INTO categories (company_id, name, external_id, direction, color, is_active)
       VALUES
         ($1, 'Vendite', 'vendite_income', 'income', '#2ecc71', true),
         ($1, 'Servizi', 'servizi_income', 'income', '#27ae60', true),
         ($1, 'Affitto', 'affitto_expense', 'expense', '#e74c3c', true),
         ($1, 'Utenze', 'utenze_expense', 'expense', '#c0392b', true)
       ON CONFLICT DO NOTHING`,
      [companyId]
    );
  } catch (error) {
    if (!isMissingColumnError(error, 'external_id')) {
      throw error;
    }

    await client.query(
      `INSERT INTO accounts (company_id, name, type, opening_balance, balance, is_active)
       VALUES
         ($1, 'Cassa', 'cash', 0, 0, true),
         ($1, 'Banca', 'bank', 0, 0, true),
         ($1, 'Carta', 'card', 0, 0, true)
       ON CONFLICT DO NOTHING`,
      [companyId]
    );

    await client.query(
      `INSERT INTO categories (company_id, name, direction, color, is_active)
       VALUES
         ($1, 'Vendite', 'income', '#2ecc71', true),
         ($1, 'Servizi', 'income', '#27ae60', true),
         ($1, 'Affitto', 'expense', '#e74c3c', true),
         ($1, 'Utenze', 'expense', '#c0392b', true)
       ON CONFLICT DO NOTHING`,
      [companyId]
    );
  }
};

const requireSuperAdmin = (req, res) => {
  if (req.user?.is_super_admin !== true) {
    sendError(res, 403, 'FORBIDDEN', 'Operation not allowed.');
    return false;
  }
  return true;
};

// Resolve the URL target once for all module routes, ignoring conflicting headers.
router.use('/:id/modules', (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    return sendError(res, 400, 'VALIDATION_INVALID_COMPANY_ID', 'Invalid company id.');
  }
  req.headers['x-company-id'] = req.params.id;
  return companyContextMiddleware(req, res, next);
});
const moduleError = (res,error) => {
  if (!error.status) console.error(error);
  return sendError(res,error.status || 500,error.status ? error.code : 'SERVER_ERROR','Unable to process company modules.',{details:error.details});
};
router.get('/:id/modules', async (req,res) => {
  try { return res.json(await readCompanyModules(req.companyId)); }
  catch(error) { return moduleError(res,error); }
});
router.get('/:id/modules/events', async (req,res) => {
  if (req.user?.is_super_admin !== true && req.companyRole !== 'admin') return sendError(res,403,'FORBIDDEN','Operation not allowed.');
  try {
    return res.json(await readModuleEvents(req.companyId,{before:req.query.before ?? null,limit:req.query.limit === undefined ? 20 : Number(req.query.limit)}));
  } catch(error) { return moduleError(res,error); }
});
router.post('/:id/modules/preview', async (req,res) => {
  if (!requireSuperAdmin(req,res)) return;
  try { return res.json(await previewCompanyModules(req.companyId,req.body)); }
  catch(error) { return moduleError(res,error); }
});

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
      await seedDefaultRecords(client, company.id);
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


router.delete('/:id', async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;

  const companyId = Number(req.params.id);
  if (!Number.isInteger(companyId)) {
    return sendError(res, 400, 'VALIDATION_MISSING_FIELDS', 'Company id is required.');
  }

  try {
    const result = await query('DELETE FROM companies WHERE id = $1 RETURNING id', [companyId]);
    if (result.rowCount === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'Company not found.');
    }
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Internal server error.');
  }
});

export default router;
