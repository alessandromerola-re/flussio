import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { query, resetDb, close, seedLegacyModules } from './_db.js';
import { getClient } from '../src/db/index.js';
import { applyCompanyModulePlan, readCompanyModules } from '../src/modules/registry.js';
import { generateDueTemplates, generateTemplateNow } from '../src/services/recurring.js';

let server, base, company, other, admin, editor, viewer, superadmin, account, job, property, otherJob;
const request = async (path, { actor = admin, target = company, method = 'GET', body } = {}) => {
  const form = body instanceof FormData;
  const response = await fetch(`${base}${path}`, { method, headers: {
    Authorization: `Bearer ${jwt.sign({ user_id: actor, default_company_id: company }, process.env.JWT_SECRET)}`,
    'X-Company-Id': String(target), ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
  }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  return { status: response.status, body: method === 'HEAD' || response.status === 204 ? null : (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text() };
};
const csv = text => { const form = new FormData(); form.append('file', new Blob([text], { type: 'text/csv' }), 'test.csv'); return form; };
const importCsv = (entity, text, options = {}) => request(`/api/import/${entity}`, { method: 'POST', body: csv(text), ...options });
const plan = async (changes, target = company) => applyCompanyModulePlan({ companyId: target, actorUserId: superadmin,
  expectedVersion: (await readCompanyModules(target)).version, reason: 'M3B integration test', changes });
const template = async (extra = {}) => {
  const result = await query(`INSERT INTO recurring_templates(company_id,external_id,title,frequency,interval,start_date,next_run_at,is_active,amount,movement_type,account_id,job_id,property_id)
    VALUES ($1,$2,'Rent','monthly',1,'2026-09-01',NOW()-INTERVAL '1 minute',$3,10,'income',$4,$5,$6) RETURNING id`,
  [extra.company ?? company, extra.external ?? 'rec_a', extra.active ?? true, extra.account ?? account, extra.job ?? null, extra.property ?? null]);
  return result.rows[0].id;
};
const readTemplate = async id => (await query('SELECT * FROM recurring_templates WHERE id=$1', [id])).rows[0];
const counts = async () => (await query(`SELECT (SELECT count(*) FROM transactions)::int AS movements,
  (SELECT count(*) FROM recurring_runs)::int AS runs,(SELECT balance FROM accounts WHERE id=$1)::text AS balance`, [account])).rows[0];
const payload = (extra = {}) => ({ title: 'Rent changed', frequency: 'monthly', interval: 1, start_date: '2026-09-01', amount: 10, movement_type: 'income', account_id: account, ...extra });
const recurringCsv = (rows, extraHeader = '') => `external_id,title,frequency,amount,movement_type,account_external_id${extraHeader}\n${rows}`;
const waitForLock = async pattern => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1", [pattern])).rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Lock barrier not reached: ${pattern}`);
};

test.before(async () => {
  process.env.JWT_SECRET ||= 'module_recurring_test_secret';
  server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async () => {
  process.env.RECURRING_GENERATOR_ENABLED = 'true';
  await resetDb({ modules: true });
  company = (await query("INSERT INTO companies(name) VALUES ('M3B A') RETURNING id")).rows[0].id;
  await seedLegacyModules(company);
  other = (await query("INSERT INTO companies(name) VALUES ('M3B B') RETURNING id")).rows[0].id;
  await seedLegacyModules(other);
  const user = async (role, elevated = false) => (await query("INSERT INTO users(company_id,email,password_hash,role,is_super_admin) VALUES ($1,$2,'unused',$3,$4) RETURNING id", [company, `${role}${elevated}@m3b.test`, role, elevated])).rows[0].id;
  admin = await user('admin'); editor = await user('editor'); viewer = await user('viewer'); superadmin = await user('admin', true);
  await query("INSERT INTO user_companies(user_id,company_id,role,is_active) VALUES ($1,$4,'admin',true),($2,$4,'editor',true),($3,$4,'viewer',true)", [admin, editor, viewer, company]);
  account = (await query("INSERT INTO accounts(company_id,external_id,name,type,balance) VALUES ($1,'bank_main','Bank','bank',0) RETURNING id", [company])).rows[0].id;
  job = (await query("INSERT INTO jobs(company_id,code,title,name,notes) VALUES ($1,'JOB_A','Job A','Job A','Private job notes') RETURNING id", [company])).rows[0].id;
  property = (await query("INSERT INTO properties(company_id,external_id,name,address,notes) VALUES ($1,'PROP_A','House A','Private address','Private property notes') RETURNING id", [company])).rows[0].id;
  otherJob = (await query("INSERT INTO jobs(company_id,code,title,name) VALUES ($1,'JOB_B','Job B','Job B') RETURNING id", [other])).rows[0].id;
  await query("INSERT INTO properties(company_id,external_id,name) VALUES ($1,'PROP_B','House B')", [other]);
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await close(); });

test('entity CSV enforces states, HEAD, company isolation and role-specific import/export permissions', async () => {
  for (const [module, entity] of [['jobs', 'jobs'], ['real_estate', 'properties']]) {
    await plan([{ module, state: 'read_only' }]);
    assert.equal((await request(`/api/export/${entity}.csv`)).status, 200);
    assert.equal((await importCsv(entity, 'code,title,name\nNEW,New,New')).body.error_code, 'MODULE_READ_ONLY');
    await plan([{ module, state: 'disabled' }]);
    assert.equal((await request(`/api/export/${entity}.csv`, { method: 'HEAD', actor: superadmin })).status, 403);
    assert.equal((await request(`/api/export/${entity}.csv`)).body.error_code, 'MODULE_DISABLED');
  }
  assert.equal((await request('/api/export/jobs.csv', { actor: viewer })).body.error_code, 'FORBIDDEN');
  assert.equal((await request('/api/export/properties.csv', { target: other })).status, 403);
  assert.equal((await request('/api/settings/movements/import-csv', { method: 'POST', actor: editor, body: csv('invalid') })).status, 403);
  assert.equal((await importCsv('transactions', 'invalid')).body.error_code, 'IMPORT_USE_MOVEMENT_WIZARD');
});

test('Base exports retain minimal historical codes without exposing optional module details', async () => {
  await template({ job, property });
  await query("INSERT INTO transactions(company_id,date,type,amount_total,job_id,property_id) VALUES ($1,'2026-09-01','income',10,$2,$3)", [company, job, property]);
  await plan([{ module: 'jobs', state: 'disabled' }, { module: 'real_estate', state: 'disabled' }]);
  for (const entity of ['transactions', 'recurring_templates']) {
    const result = await request(`/api/export/${entity}.csv`); assert.equal(result.status, 200);
    assert.ok(result.body.includes('JOB_A')); assert.ok(result.body.includes('PROP_A'));
    assert.ok(!result.body.includes('Private address')); assert.ok(!result.body.includes('Private job notes'));
  }
});

test('row savepoints preserve valid imports after a SQL validation error and report accurate counts', async () => {
  const result = await importCsv('jobs', 'code,title,expected_revenue_cents\nBAD,Bad budget,-1\nGOOD,Good budget,100');
  assert.equal(result.status, 200); assert.equal(result.body.created, 1); assert.equal(result.body.errors, 1);
  assert.equal((await query("SELECT count(*) FROM jobs WHERE code='BAD'")).rows[0].count, '0');
  assert.equal((await query("SELECT count(*) FROM jobs WHERE code='GOOD'")).rows[0].count, '1');
});

test('recurrence CSV preserves omitted references but a forbidden explicit removal rolls back the whole file', async () => {
  const id = await template({ job, property });
  await plan([{ module: 'jobs', state: 'read_only' }, { module: 'real_estate', state: 'disabled' }]);
  const keep = await importCsv('recurring_templates', recurringCsv('rec_a,Updated rent,monthly,11,income,bank_main'));
  assert.equal(keep.status, 200); assert.equal(keep.body.updated, 1);
  const retained = await readTemplate(id); assert.equal(retained.job_id, job); assert.equal(retained.property_id, property);
  const remove = await importCsv('recurring_templates', recurringCsv('plain,Plain,monthly,10,income,bank_main,\nrec_a,Remove,monthly,10,income,bank_main,', ',job_code'));
  assert.equal(remove.status, 403); assert.equal(remove.body.error_code, 'MODULE_READ_ONLY');
  assert.equal((await query("SELECT count(*) FROM recurring_templates WHERE external_id='plain'")).rows[0].count, '0');
  assert.deepEqual(await readTemplate(id), retained);
  // Jobs created without a code must survive exporting and importing references.
  await query('UPDATE jobs SET code=NULL WHERE id=$1', [job]);
  const exported = await request('/api/export/recurring_templates.csv');
  assert.ok(exported.body.includes('job_name')); assert.ok(exported.body.includes('Job A'));
  const named = await importCsv('recurring_templates', recurringCsv('rec_a,Named job,monthly,11,income,bank_main,,Job A', ',job_code,job_name'));
  assert.equal(named.body.updated, 1); assert.equal((await readTemplate(id)).job_id, job);
  await query("INSERT INTO jobs(company_id,title,name) VALUES ($1,'Job A','Job A')", [company]);
  const ambiguous = await importCsv('recurring_templates', recurringCsv('rec_a,Ambiguous,monthly,11,income,bank_main,,Job A', ',job_code,job_name'));
  assert.equal(ambiguous.body.errors, 1); assert.equal(ambiguous.body.updated, 0); assert.equal((await readTemplate(id)).job_id, job);
});

test('recurrence CSV resolves only same-company links and denies activation of a suspended template', async () => {
  const foreign = await importCsv('recurring_templates', recurringCsv('foreign,Foreign,monthly,10,income,bank_main,PROP_B', ',property_external_id'));
  assert.equal(foreign.body.errors, 1); assert.equal(foreign.body.created, 0);
  const local = await importCsv('recurring_templates', recurringCsv('local,Local,monthly,10,income,bank_main,PROP_A,JOB_A', ',property_external_id,job_code'));
  assert.equal(local.body.created, 1);
  const row = (await query("SELECT * FROM recurring_templates WHERE external_id='local'")).rows[0]; assert.equal(row.property_id, property); assert.equal(row.job_id, job);
  await query('UPDATE recurring_templates SET is_active=false WHERE id=$1', [row.id]);
  await plan([{ module: 'jobs', state: 'disabled' }]);
  const keepInactive = await importCsv('recurring_templates', recurringCsv('local,Still inactive,monthly,10,income,bank_main'));
  assert.equal(keepInactive.status, 200); assert.equal(keepInactive.body.updated, 1); assert.equal((await readTemplate(row.id)).is_active, false);
  const activate = await importCsv('recurring_templates', recurringCsv('local,Local,monthly,10,income,bank_main,true', ',is_active'));
  assert.equal(activate.status, 403); assert.equal((await readTemplate(row.id)).is_active, false);
});

test('movement wizard rejects module-linked imports atomically and never drops an unknown job silently', async () => {
  const header = 'date;type;amount_total;account_names;commessa;property_code';
  await plan([{ module: 'jobs', state: 'read_only' }]);
  const denied = await request('/api/settings/movements/import-csv', { method: 'POST', body: csv(`${header}\n2026-09-01;income;20;Bank;;\n2026-09-01;income;10;Bank;Job A;`) });
  assert.equal(denied.status, 403); assert.deepEqual(await counts(), { movements: 0, runs: 0, balance: '0.00' });
  await plan([{ module: 'jobs', state: 'enabled' }]);
  const unknown = await request('/api/settings/movements/import-csv', { method: 'POST', body: csv(`${header}\n2026-09-01;income;10;Bank;Unknown job;`) });
  assert.equal(unknown.status, 201); assert.equal(unknown.body.imported, 0); assert.equal(unknown.body.skipped, 1);
  await plan([{ module: 'jobs', state: 'disabled' }, { module: 'real_estate', state: 'disabled' }]);
  const plain = await request('/api/settings/movements/import-csv', { method: 'POST', body: csv(`${header}\n2026-09-01;income;20;Bank;;`) });
  assert.equal(plain.body.imported, 1); assert.equal(Number((await counts()).balance), 20);
});

test('recurrence CRUD preserves omitted links, checks alias removal and allows stopping suspended templates', async () => {
  const created = await request('/api/recurring-templates', { method: 'POST', body: payload({ jobId: job, property_id: property }) }); assert.equal(created.status, 201);
  const id = created.body.id;
  await plan([{ module: 'jobs', state: 'read_only' }, { module: 'real_estate', state: 'disabled' }]);
  const update = await request(`/api/recurring-templates/${id}`, { method: 'PUT', body: payload() });
  assert.equal(update.status, 200); assert.equal(update.body.job_id, job); assert.equal(update.body.property_id, property); assert.equal(update.body.module_suspension.code, 'MODULE_READ_ONLY');
  assert.equal((await request(`/api/recurring-templates/${id}`, { method: 'PUT', body: payload({ propertyId: null }) })).status, 403);
  assert.equal((await request(`/api/recurring-templates/${id}`, { method: 'PUT', body: payload({ job_id: null, jobId: job }) })).status, 400);
  assert.equal((await request(`/api/recurring-templates/${id}/active`, { method: 'PATCH', body: { is_active: false } })).status, 200);
  assert.equal((await request(`/api/recurring-templates/${id}/active`, { method: 'PATCH', body: { is_active: true } })).status, 403);
  assert.equal((await request(`/api/recurring-templates/${id}`, { method: 'PUT', body: payload({ is_active: true }) })).status, 403);
  assert.equal((await request(`/api/recurring-templates/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await readTemplate(id)).job_id, job);
  assert.equal((await request(`/api/recurring-templates/${id}/generate-now`, { method: 'POST', actor: viewer })).status, 403);
});

test('manual and due generation suspend without changing links, dates, runs or balances', async () => {
  const id = await template({ job, property }), before = await readTemplate(id);
  await plan([{ module: 'jobs', state: 'read_only' }]);
  const manual = await request(`/api/recurring-templates/${id}/generate-now`, { method: 'POST' });
  assert.equal(manual.body.reason, 'module_suspended'); assert.equal(manual.body.code, 'MODULE_READ_ONLY');
  const due = await generateDueTemplates({ companyId: company, runType: 'auto' }); assert.equal(due.created_count, 0); assert.equal(due.skipped_details[0].module, 'jobs');
  const detail = await request(`/api/recurring-templates/${id}`); assert.equal(detail.body.module_suspension.code, 'MODULE_READ_ONLY');
  assert.deepEqual(await readTemplate(id), before); assert.equal((await counts()).runs, 0); assert.equal(Number((await counts()).balance), 0);
  await plan([{ module: 'jobs', state: 'enabled' }, { module: 'real_estate', state: 'disabled' }]);
  assert.equal((await generateTemplateNow(id, company)).module, 'real_estate');
});

test('technical off wins over module status even for direct manual calls', async () => {
  const id = await template({ job }); await plan([{ module: 'jobs', state: 'read_only' }]);
  const before = await readTemplate(id); process.env.RECURRING_GENERATOR_ENABLED = 'false';
  assert.equal((await request(`/api/recurring-templates/${id}/generate-now`, { method: 'POST' })).body.code, 'RECURRING_GENERATOR_DISABLED');
  assert.equal((await request('/api/recurring-templates/generate-due', { method: 'POST' })).body.generator_enabled, false);
  assert.equal((await generateDueTemplates()).created_count, 0);
  assert.deepEqual(await readTemplate(id), before); assert.equal((await counts()).movements, 0);
});

test('global worker resolves each company separately; malformed foreign references cannot generate', async () => {
  const blocked = await template({ job });
  const foreignAccount = (await query("INSERT INTO accounts(company_id,name,type,balance) VALUES ($1,'Other Bank','bank',0) RETURNING id", [other])).rows[0].id;
  const allowed = await template({ company: other, account: foreignAccount, job: otherJob, external: 'rec_b' });
  await plan([{ module: 'jobs', state: 'disabled' }]);
  const result = await generateDueTemplates(); assert.equal(result.created_count, 1); assert.equal(result.skipped_details[0].template_id, blocked);
  assert.equal((await query('SELECT count(*) FROM transactions WHERE recurring_template_id=$1', [allowed])).rows[0].count, '1');
  await plan([{ module: 'jobs', state: 'enabled' }]);
  const malformed = await template({ external: 'bad', job: otherJob });
  assert.equal((await generateTemplateNow(malformed, company)).code, 'RECURRING_INVALID_REFERENCE');
  assert.equal((await query('SELECT count(*) FROM transactions WHERE recurring_template_id=$1', [malformed])).rows[0].count, '0');
});

test('reenabling resumes once, while Base recurring generation is independent of optional modules', async () => {
  const id = await template({ job }); await plan([{ module: 'jobs', state: 'read_only' }]);
  assert.equal((await generateTemplateNow(id, company)).reason, 'module_suspended');
  const plain = await template({ external: 'plain' }); assert.equal((await generateTemplateNow(plain, company)).status, 'created');
  await plan([{ module: 'jobs', state: 'enabled' }]);
  assert.equal((await generateTemplateNow(id, company)).status, 'created');
  assert.equal((await generateTemplateNow(id, company)).reason, 'already_generated');
  assert.equal((await query('SELECT count(*) FROM transactions WHERE recurring_template_id=$1', [id])).rows[0].count, '1');
});

test('generation audit failure rolls back runs, movements, dates and balances', async () => {
  const id = await template({ job }), before = await readTemplate(id);
  await query("CREATE FUNCTION reject_generation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='generate' THEN RAISE EXCEPTION 'test generation audit'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_generation_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_generation_audit();");
  try { await assert.rejects(generateTemplateNow(id, company), /test generation audit/); }
  finally { await query('DROP TRIGGER reject_generation_audit ON audit_log; DROP FUNCTION reject_generation_audit();'); }
  assert.deepEqual(await readTemplate(id), before); assert.equal((await counts()).runs, 0); assert.equal(Number((await counts()).balance), 0);
});

test('movement import holds the company lock across the batch before queued revocation', async () => {
  const blocker = await getClient(); let importWork, transition;
  const text = 'date;type;amount_total;account_names;commessa\n2026-09-01;income;10;Bank;Job A';
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [account]);
    importWork = request('/api/settings/movements/import-csv', { method: 'POST', body: csv(text) });
    await waitForLock('%FROM accounts%FOR UPDATE%'); transition = plan([{ module: 'jobs', state: 'read_only' }]);
    await waitForLock('SELECT modules_version FROM companies WHERE id=$1 FOR UPDATE%');
    await blocker.query('COMMIT'); assert.equal((await importWork).body.imported, 1); await transition;
    assert.equal((await request('/api/settings/movements/import-csv', { method: 'POST', body: csv(text) })).status, 403);
    assert.equal((await counts()).movements, 1);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await Promise.allSettled([importWork, transition].filter(Boolean)); }
});

test('worker takes the company lock before the template and completes before queued revocation', async () => {
  const id = await template({ job }), blocker = await getClient(); let worker, transition;
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT id FROM recurring_templates WHERE id=$1 FOR UPDATE', [id]);
    worker = generateDueTemplates({ companyId: company });
    await waitForLock('SELECT * FROM recurring_templates WHERE id = $1 AND company_id = $2 FOR UPDATE%');
    transition = plan([{ module: 'jobs', state: 'read_only' }]); await waitForLock('SELECT modules_version FROM companies WHERE id=$1 FOR UPDATE%');
    await blocker.query('COMMIT'); assert.equal((await worker).created_count, 1); await transition;
    assert.equal((await generateTemplateNow(id, company)).reason, 'module_suspended'); assert.equal((await counts()).movements, 1);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await Promise.allSettled([worker, transition].filter(Boolean)); }
});
