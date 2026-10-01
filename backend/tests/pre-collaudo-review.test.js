import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';
import { generateDueTemplates } from '../src/services/recurring.js';

let server, base, company, other, account, bank, category, foreignCategory, token;
const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': String(company), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: response.status === 204 ? null : (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text() };
};
const csv = (path, text) => { const form = new FormData(); form.append('file', new Blob([text], { type: 'text/csv' }), 'review.csv'); return request(path, { method: 'POST', body: form }); };
const movement = (overrides = {}) => ({ date: '2026-09-01', type: 'income', amount_total: 10, accounts: [{ account_id: account, direction: 'in', amount: 10 }], ...overrides });
const recurring = (overrides = {}) => ({ title: 'Canone', frequency: 'monthly', interval: 1, start_date: '2026-01-01', amount: 10, movement_type: 'expense', account_id: account, ...overrides });

test.before(async () => { process.env.JWT_SECRET = 'review_test_secret'; server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.beforeEach(async () => {
  process.env.RECURRING_GENERATOR_ENABLED = 'false';
  await resetDb({ modules: true });
  [company, other] = (await query("INSERT INTO companies(name) VALUES ('Review'),('Other') RETURNING id")).rows.map(row => row.id);
  const user = (await query("INSERT INTO users(company_id,email,password_hash,role) VALUES ($1,'review@test.local','hash','admin') RETURNING id", [company])).rows[0].id;
  await query("INSERT INTO user_companies(user_id,company_id,role) VALUES ($1,$2,'admin')", [user, company]);
  token = jwt.sign({ user_id: user, default_company_id: company }, process.env.JWT_SECRET);
  [account, bank] = (await query("INSERT INTO accounts(company_id,name,type,external_id) VALUES ($1,'Cassa','cash','cash'),($1,'Banca','bank','bank') RETURNING id", [company])).rows.map(row => row.id);
  category = (await query("INSERT INTO categories(company_id,name,direction,external_id) VALUES ($1,'Vendite','income','sales') RETURNING id", [company])).rows[0].id;
  foreignCategory = (await query("INSERT INTO categories(company_id,name,direction) VALUES ($1,'Private category','income') RETURNING id", [other])).rows[0].id;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); await close(); });

test('movement create/update reject mismatched legs, direction, precision and malformed arrays without changing balances', async () => {
  const valid = await request('/api/transactions', { method: 'POST', body: movement() }); assert.equal(valid.status, 201);
  for (const payload of [
    movement({ accounts: [{ account_id: account, direction: 'in', amount: 9 }] }),
    movement({ accounts: [{ account_id: account, direction: 'out', amount: 10 }] }),
    movement({ amount_total: 0.005, accounts: [{ account_id: account, direction: 'in', amount: 0.005 }] }),
    movement({ type: 'transfer', accounts: [{ account_id: account, direction: 'in', amount: 10 }, { account_id: account, direction: 'out', amount: 10 }] }),
    movement({ accounts: null }), movement({ accounts: {} }), movement({ accounts: [null] }), movement({ date: '2026-02-30' }),
  ]) for (const [method, path] of [['POST', '/api/transactions'], ['PUT', `/api/transactions/${valid.body.id}`]]) {
    assert.equal((await request(path, { method, body: payload })).status, 400);
  }
  assert.equal((await query('SELECT balance FROM accounts WHERE id=$1', [account])).rows[0].balance, '10.00');
  assert.equal((await query('SELECT count(*) FROM transactions')).rows[0].count, '1');
});

test('split income and balanced transfers preserve exact cents in account reconciliation', async () => {
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ amount_total: 0.3, accounts: [{ account_id: account, direction: 'in', amount: 0.1 }, { account_id: bank, direction: 'in', amount: 0.2 }] }) })).status, 201);
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ type: 'transfer', accounts: [{ account_id: account, direction: 'out', amount: 10 }, { account_id: bank, direction: 'in', amount: 10 }] }) })).status, 201);
  assert.equal((await request('/api/accounts/reconciliation')).body.is_reconciled, true);
});

test('category and contact references cannot cross company boundaries on create or update', async () => {
  for (const method of ['POST', 'PUT']) {
    const catPath = method === 'POST' ? '/api/categories' : `/api/categories/${category}`;
    assert.equal((await request(catPath, { method, body: { name: 'Child', direction: 'income', parent_id: foreignCategory } })).status, 400);
  }
  assert.equal((await request('/api/contacts', { method: 'POST', body: { name: 'Contact', default_category_id: foreignCategory } })).status, 400);
  const contact = await request('/api/contacts', { method: 'POST', body: { name: 'Contact', default_category_id: category } }); assert.equal(contact.status, 201);
  assert.equal((await request(`/api/contacts/${contact.body.id}`, { method: 'PUT', body: { name: 'Contact', default_category_id: foreignCategory } })).status, 400);
  // Legacy invalid data cannot expose the foreign category's name.
  await query('UPDATE contacts SET default_category_id=$1 WHERE id=$2', [foreignCategory, contact.body.id]);
  assert.equal((await request('/api/contacts')).body[0].default_category_name, null);
});

test('category trees reject cycles and direction mismatches', async () => {
  const child = await request('/api/categories', { method: 'POST', body: { name: 'Child', direction: 'income', parent_id: category } }); assert.equal(child.status, 201);
  assert.equal((await request(`/api/categories/${category}`, { method: 'PUT', body: { name: 'Root', direction: 'income', parent_id: child.body.id } })).status, 400);
  assert.equal((await request(`/api/categories/${category}`, { method: 'PUT', body: { name: 'Root', direction: 'expense' } })).status, 400);
});

test('concurrent opposite category parent changes cannot create a cycle', async () => {
  const child = await request('/api/categories', { method: 'POST', body: { name: 'Child', direction: 'income' } });
  assert.equal(child.status, 201);
  const results = await Promise.all([
    request(`/api/categories/${category}`, { method: 'PUT', body: { name: 'Root', direction: 'income', parent_id: child.body.id } }),
    request(`/api/categories/${child.body.id}`, { method: 'PUT', body: { name: 'Child', direction: 'income', parent_id: category } }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
});

test('category CSV cannot create a self-cycle and subsequent valid rows still import', async () => {
  const result = await csv('/api/import/categories', 'external_id,name,direction,category_parent_external_id\nsales,Vendite,income,sales\nnew,New,income,sales');
  assert.equal(result.status, 200); assert.equal(result.body.errors, 1); assert.equal(result.body.created, 1);
  assert.equal((await query('SELECT parent_id FROM categories WHERE id=$1', [category])).rows[0].parent_id, null);
});

test('contact CSV preserves multiline names and default category on export/reimport', async () => {
  const name = 'Company "A"\nSecond line';
  await request('/api/contacts', { method: 'POST', body: { name, default_category_id: category } });
  const exported = await request('/api/export/contacts.csv'); assert.equal(exported.status, 200);
  await query('DELETE FROM contacts WHERE company_id=$1', [company]);
  const imported = await csv('/api/import/contacts', exported.body); assert.equal(imported.body.created, 1); assert.equal(imported.body.errors, 0);
  const contact = (await request('/api/contacts')).body[0]; assert.equal(contact.name, name); assert.equal(contact.default_category_id, category);
});

test('movement CSV roundtrip retains split allocations, quoted multiline notes and balances', async () => {
  const description = 'Prima riga; "test"\nSeconda riga';
  const created = await request('/api/transactions', { method: 'POST', body: movement({ description, accounts: [{ account_id: account, direction: 'in', amount: 4 }, { account_id: bank, direction: 'in', amount: 6 }] }) }); assert.equal(created.status, 201);
  const exported = await request('/api/transactions/export'); assert.equal(exported.status, 200);
  assert.equal((await request(`/api/transactions/${created.body.id}`, { method: 'DELETE' })).status, 204);
  const imported = await csv('/api/settings/movements/import-csv', exported.body); assert.equal(imported.status, 201); assert.equal(imported.body.imported, 1); assert.equal(imported.body.skipped, 0);
  const row = (await request('/api/transactions')).body[0]; assert.equal(row.description, description);
  assert.deepEqual(row.accounts.map(leg => [leg.account_id, Number(leg.amount)]), [[account, 4], [bank, 6]]);
  assert.equal((await request('/api/accounts/reconciliation')).body.is_reconciled, true);
});

test('legacy multi-account CSV without allocation values is rejected instead of charging the first account', async () => {
  const result = await csv('/api/settings/movements/import-csv', 'date;type;amount_total;account_names\n2026-09-01;income;10;Cassa → Banca');
  assert.equal(result.body.imported, 0); assert.equal(result.body.skipped, 1);
  assert.equal((await query('SELECT count(*) FROM transactions')).rows[0].count, '0');
});

test('unclosed CSV quoting fails before committing any records', async () => {
  assert.equal((await csv('/api/import/contacts', 'name\nValid\n"Unclosed')).status, 400);
  assert.equal((await csv('/api/settings/movements/import-csv', 'date;type;amount_total;account_names\n2026-09-01;income;10;"Cassa')).status, 400);
  assert.equal((await query('SELECT count(*) FROM contacts')).rows[0].count, '0');
});

test('recurring CSV computes future schedule, validates intervals and keeps due date on metadata edits', async () => {
  const header = 'external_id,title,frequency,interval,start_date,amount,movement_type,account_external_id';
  let result = await csv('/api/import/recurring_templates', `${header}\nfuture,Future,monthly,1,2099-06-01,10,expense,cash\nbad,Bad,monthly,0,2099-06-01,10,expense,cash`);
  assert.equal(result.body.created, 1); assert.equal(result.body.errors, 1);
  const row = (await query('SELECT * FROM recurring_templates')).rows[0]; assert.match(row.next_run_at.toISOString(), /^2099-05-31T22:05/);
  await query('UPDATE recurring_templates SET next_run_at=$1 WHERE id=$2', [new Date('2099-08-31T22:05:00Z'), row.id]);
  result = await request(`/api/recurring-templates/${row.id}`, { method: 'PUT', body: recurring({ start_date: '2099-06-01', title: 'Changed title' }) }); assert.equal(result.status, 200); assert.equal(result.body.next_run_at, '2099-08-31T22:05:00.000Z');
  result = await csv('/api/import/recurring_templates', `${header}\nfuture,CSV title,monthly,1,2099-06-01,10,expense,cash`); assert.equal(result.body.updated, 1);
  assert.equal((await query('SELECT next_run_at FROM recurring_templates')).rows[0].next_run_at.toISOString(), '2099-08-31T22:05:00.000Z');
});

test('due recurring generation respects PostgreSQL DATE end_date and advances an already generated cycle', async () => {
  process.env.RECURRING_GENERATOR_ENABLED = 'true';
  const id = (await query("INSERT INTO recurring_templates(company_id,title,frequency,interval,start_date,end_date,next_run_at,amount,movement_type,account_id) VALUES ($1,'Expired','monthly',1,'2020-01-01','2020-02-01','2020-03-01T00:05:00Z',10,'expense',$2) RETURNING id", [company, account])).rows[0].id;
  let result = await generateDueTemplates({ companyId: company }); assert.equal(result.created_count, 0); assert.equal(result.skipped_details[0].reason, 'beyond_end_date');
  await query("UPDATE recurring_templates SET end_date=NULL,is_active=true,next_run_at='2020-03-01T00:05:00Z' WHERE id=$1", [id]);
  await query("INSERT INTO recurring_runs(template_id,cycle_key,run_type,run_at) VALUES ($1,'2020-03','auto',NOW())", [id]);
  result = await generateDueTemplates({ companyId: company }); assert.equal(result.created_count, 0); assert.equal(result.skipped_details[0].reason, 'already_generated');
  assert.equal((await query('SELECT next_run_at FROM recurring_templates WHERE id=$1', [id])).rows[0].next_run_at.toISOString(), '2020-03-31T22:05:00.000Z');
  assert.equal((await query('SELECT balance FROM accounts WHERE id=$1', [account])).rows[0].balance, '0.00');
});

test('invalid company ids and invalid opening balances return 400 without server errors', async () => {
  for (const id of ['0','2147483648','999999999999999999999']) assert.equal((await request('/api/accounts', { headers: { 'X-Company-Id': id } })).status, 400);
  for (const amount of ['Infinity', true, '0.001', '10000000000']) assert.equal((await request('/api/accounts', { method: 'POST', body: { name: 'Bad', type: 'cash', opening_balance: amount } })).status, 400);
});


test('attachment upload/delete and audit are atomic; failed uploads remove their temporary files', async () => {
  const created = await request('/api/transactions', { method: 'POST', body: movement() });
  const uploadDir = path.resolve('uploads', `company_${company}`, `tx_${created.body.id}`);
  await rm(uploadDir, { recursive: true, force: true });
  await query(`CREATE FUNCTION fail_attachment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='attachments' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_attachment_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_attachment_audit()`);
  const upload = () => { const form = new FormData(); form.append('file', new Blob(['test attachment'], { type: 'text/plain' }), 'review.txt'); return request(`/api/attachments/${created.body.id}`, { method: 'POST', body: form }); };
  try {
    assert.equal((await upload()).status, 500);
    assert.equal((await query('SELECT count(*) FROM attachments')).rows[0].count, '0');
    assert.deepEqual(await readdir(uploadDir), []);
    await query('ALTER TABLE audit_log DISABLE TRIGGER test_attachment_audit');
    const valid = await upload(); assert.equal(valid.status, 201);
    const file = path.resolve('uploads', valid.body.storage_path); await access(file);
    await query('ALTER TABLE audit_log ENABLE TRIGGER test_attachment_audit');
    assert.equal((await request(`/api/attachments/${valid.body.id}`, { method: 'DELETE' })).status, 500);
    assert.equal((await query('SELECT count(*) FROM attachments')).rows[0].count, '1'); await access(file);
    await query('ALTER TABLE audit_log DISABLE TRIGGER test_attachment_audit');
    assert.equal((await request(`/api/attachments/${valid.body.id}`, { method: 'DELETE' })).status, 204);
    await assert.rejects(access(file), { code: 'ENOENT' });
  } finally { await rm(uploadDir, { recursive: true, force: true }); }
});
