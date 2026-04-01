import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';

let server;
let baseUrl;
let token;
let companyId;
let otherCompanyId;

const requestCsv = async (path, companyHeader) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Company-Id': String(companyHeader),
    },
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
};

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  await resetDb();

  const company = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Acme SRL']);
  const companyOther = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Other SRL']);
  companyId = company.rows[0].id;
  otherCompanyId = companyOther.rows[0].id;

  const user = await query(
    'INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [companyId, 'admin@acme.local', 'hash', 'admin']
  );

  await query(
    'INSERT INTO user_companies (user_id, company_id, role, is_active) VALUES ($1, $2, $3, true), ($1, $4, $3, true)',
    [user.rows[0].id, companyId, 'admin', otherCompanyId]
  );

  token = jwt.sign(
    {
      user_id: user.rows[0].id,
      email: 'admin@acme.local',
      default_company_id: companyId,
      role: 'admin',
      is_super_admin: false,
    },
    process.env.JWT_SECRET
  );

  const parentCategory = await query(
    'INSERT INTO categories (company_id, external_id, name, direction, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id',
    [companyId, 'cat_parent', 'Vendite', 'income']
  );
  const category = await query(
    'INSERT INTO categories (company_id, external_id, name, direction, parent_id, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id',
    [companyId, 'cat_child', 'Servizi', 'income', parentCategory.rows[0].id]
  );
  const contact = await query(
    'INSERT INTO contacts (company_id, external_id, name, email, phone, default_category_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id',
    [companyId, 'ct_mario', 'Mario Rossi', 'mario@example.com', '123', category.rows[0].id]
  );

  await query(
    'INSERT INTO accounts (company_id, external_id, name, type, opening_balance, balance, is_active) VALUES ($1, $2, $3, $4, $5, $5, true)',
    [companyId, 'acc_main', 'Conto Corrente', 'bank', 1200]
  );
  await query(
    `INSERT INTO jobs (company_id, code, title, name, notes, contact_id, is_active, is_closed, expected_revenue_cents, expected_cost_cents, start_date, end_date)
     VALUES ($1, $2, $3, $3, $4, $5, true, false, $6, $7, $8, $9)`,
    [companyId, 'JOB001', 'Ristrutturazione', 'note', contact.rows[0].id, 100000, 50000, '2026-01-01', '2026-03-31']
  );
  await query(
    'INSERT INTO properties (company_id, external_id, name, notes, contact_id, is_active) VALUES ($1, $2, $3, $4, $5, true)',
    [companyId, 'prop_centro', 'Immobile Centro', 'appartamento', contact.rows[0].id]
  );

  await query(
    'INSERT INTO accounts (company_id, external_id, name, type, opening_balance, balance, is_active) VALUES ($1, $2, $3, $4, $5, $5, true)',
    [otherCompanyId, 'acc_other', 'Other Account', 'cash', 99]
  );

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await close();
});

test('registry CSV exports return downloadable files with scoped company data', async () => {
  const targets = [
    { entity: 'accounts', filePrefix: 'flussio_accounts_', mustContain: ['Conto Corrente'], mustNotContain: ['Other Account'] },
    { entity: 'categories', filePrefix: 'flussio_categories_', mustContain: ['Servizi', 'Vendite'] },
    { entity: 'contacts', filePrefix: 'flussio_contacts_', mustContain: ['Mario Rossi', 'default_category_name'] },
    { entity: 'jobs', filePrefix: 'flussio_jobs_', mustContain: ['Ristrutturazione', 'contact_name'] },
    { entity: 'properties', filePrefix: 'flussio_properties_', mustContain: ['Immobile Centro', 'contact_name'] },
  ];

  for (const target of targets) {
    const response = await requestCsv(`/api/export/${target.entity}.csv`, companyId);
    assert.equal(response.status, 200, `expected 200 for ${target.entity}`);
    assert.match(response.headers.get('content-type') || '', /text\/csv/i);
    assert.match(response.headers.get('content-disposition') || '', new RegExp(`filename=\"${target.filePrefix}\\d{4}-\\d{2}-\\d{2}\\.csv\"`));
    for (const expected of target.mustContain) {
      assert.match(response.body, new RegExp(expected));
    }
    for (const unexpected of target.mustNotContain || []) {
      assert.doesNotMatch(response.body, new RegExp(unexpected));
    }
  }
});
