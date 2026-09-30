import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { resetDb, query, close } from './_db.js';
import { getClient } from '../src/db/index.js';
import { applyCompanyModulePlan, readCompanyModules } from '../src/modules/registry.js';

let server, base, company, other, admin, viewer, superadmin, job, property, account, otherJob;
const request = async (path, { actor = admin, target = company, method = 'GET', body } = {}) => {
  const response = await fetch(`${base}${path}`, { method, headers: {
    Authorization: `Bearer ${jwt.sign({ user_id: actor, default_company_id: company }, process.env.JWT_SECRET)}`,
    'X-Company-Id': String(target), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const contentType = response.headers.get('content-type') || '';
  return { status: response.status, body: response.status === 204 || method === 'HEAD' ? null : contentType.includes('json') ? await response.json() : await response.text(), total: response.headers.get('x-total-count') };
};
const plan = async (changes, target = company) => applyCompanyModulePlan({ companyId: target, actorUserId: superadmin,
  expectedVersion: (await readCompanyModules(target)).version, reason: 'Enforcement integration test', changes });
const movement = (extra = {}, amount = 20) => ({ date: '2026-09-30', type: 'income', amount_total: amount,
  accounts: [{ account_id: account, direction: 'in', amount }], ...extra });
const balance = async () => Number((await query('SELECT balance FROM accounts WHERE id=$1', [account])).rows[0].balance);
const stored = async id => (await query('SELECT * FROM transactions WHERE id=$1', [id])).rows[0];

// Wait for an observed database lock barrier, not a guessed duration. The deadline
// only bounds a failing test; it never determines ordering in the successful path.
const waitForLock = async pattern => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1", [pattern]);
    if (result.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Database lock barrier not reached: ${pattern}`);
};

test.before(async () => {
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
  await resetDb({ modules: true });
  company = (await query("INSERT INTO companies(name) VALUES ('Enforcement A') RETURNING id")).rows[0].id;
  other = (await query("INSERT INTO companies(name) VALUES ('Enforcement B') RETURNING id")).rows[0].id;
  const makeUser = async (email, role, elevated = false) => (await query("INSERT INTO users(company_id,email,password_hash,role,is_super_admin) VALUES ($1,$2,'unused',$3,$4) RETURNING id", [company, email, role, elevated])).rows[0].id;
  admin = await makeUser('admin@enforcement.test', 'admin');
  viewer = await makeUser('viewer@enforcement.test', 'viewer');
  superadmin = await makeUser('super@enforcement.test', 'admin', true);
  await query("INSERT INTO user_companies(user_id,company_id,role,is_active) VALUES ($1,$3,'admin',true),($2,$3,'viewer',true)", [admin, viewer, company]);
  account = (await query("INSERT INTO accounts(company_id,name,type,opening_balance,balance) VALUES ($1,'Bank','bank',0,0) RETURNING id", [company])).rows[0].id;
  job = (await query("INSERT INTO jobs(company_id,name,title,notes,expected_revenue_cents) VALUES ($1,'Historical job','Historical job','Private budget notes',99999) RETURNING id", [company])).rows[0].id;
  property = (await query("INSERT INTO properties(company_id,name,address,notes) VALUES ($1,'Historical property','Private address','Private property notes') RETURNING id", [company])).rows[0].id;
  otherJob = (await query("INSERT INTO jobs(company_id,name,title) VALUES ($1,'Foreign job','Foreign job') RETURNING id", [other])).rows[0].id;
  server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async () => {
  await plan([{ module: 'jobs', state: 'enabled' }, { module: 'real_estate', state: 'enabled' }]);
  await plan([{ module: 'jobs', state: 'enabled' }, { module: 'real_estate', state: 'enabled' }], other);
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await close(); });

test('module checks preserve role permissions, company isolation and superadmin constraints', async () => {
  assert.equal((await request('/api/jobs', { actor: viewer })).status, 200);
  assert.equal((await request('/api/properties', { actor: viewer })).status, 200);
  assert.equal((await request('/api/jobs', { actor: viewer, method: 'POST', body: { title: 'Denied' } })).status, 403);
  assert.equal((await request('/api/properties', { target: other })).status, 403);
  await plan([{ module: 'jobs', state: 'disabled' }], other);
  const denied = await request('/api/jobs', { actor: superadmin, target: other });
  assert.equal(denied.status, 403); assert.equal(denied.body.error_code, 'MODULE_DISABLED');
  assert.equal((await request('/api/jobs')).status, 200);
  assert.equal((await request('/api/jobs', { actor: superadmin, target: other, method: 'HEAD' })).status, 403);
});

for (const [module, endpoint, id, payload] of [
  ['jobs', 'jobs', () => job, { title: 'Changed job' }],
  ['real_estate', 'properties', () => property, { name: 'Changed property' }],
]) {
  test(`${module}: disabled blocks reads and writes; read-only allows reads only`, async () => {
    for (const state of ['disabled', 'read_only']) {
      await plan([{ module, state }]);
      for (const path of [`/api/${endpoint}`, `/api/${endpoint}/${id()}`]) assert.equal((await request(path)).status, state === 'disabled' ? 403 : 200);
      for (const [method, path] of [['POST', `/api/${endpoint}`], ['PUT', `/api/${endpoint}/${id()}`], ['DELETE', `/api/${endpoint}/${id()}`]]) {
        const result = await request(path, { method, body: payload });
        assert.equal(result.status, 403); assert.equal(result.body.error_code, state === 'disabled' ? 'MODULE_DISABLED' : 'MODULE_READ_ONLY');
      }
    }
  });
}

test('enabled CRUD commits module data and job audit together; invalid references roll back', async () => {
  const created = await request('/api/jobs', { method: 'POST', body: { title: 'New module job', expectedRevenueCents: 1234 } });
  assert.equal(created.status, 201);
  const updated = await request(`/api/jobs/${created.body.id}`, { method: 'PUT', body: { title: 'Updated module job', expectedRevenueCents: 2345 } });
  assert.equal(updated.status, 200); assert.equal(Number(updated.body.expectedRevenueCents), 2345);
  assert.equal((await request(`/api/jobs/${created.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await query("SELECT count(*) FROM audit_log WHERE entity_type='jobs' AND entity_id=$1", [String(created.body.id)])).rows[0].count, '3');
  const prop = await request('/api/properties', { method: 'POST', body: { name: 'New module property' } }); assert.equal(prop.status, 201);
  assert.equal((await request(`/api/properties/${prop.body.id}`, { method: 'PUT', body: { name: 'Updated module property' } })).status, 200);
  assert.equal((await request(`/api/properties/${prop.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await request('/api/jobs', { method: 'POST', body: { title: 'Invalid contact', contact_id: 2147483647 } })).status, 400);
  assert.equal((await query("SELECT count(*) FROM jobs WHERE title='Invalid contact'")).rows[0].count, '0');
});

test('job audit failure rolls back creation before any success response', async () => {
  await query("CREATE FUNCTION reject_job_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='jobs' THEN RAISE EXCEPTION 'test job audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_job_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_job_audit();");
  try {
    assert.equal((await request('/api/jobs', { method: 'POST', body: { title: 'Must roll back' } })).status, 500);
    assert.equal((await query("SELECT count(*) FROM jobs WHERE title='Must roll back'")).rows[0].count, '0');
  } finally { await query('DROP TRIGGER reject_job_audit ON audit_log; DROP FUNCTION reject_job_audit();'); }
});

test('movement audit failure rolls back the movement, account entries and balance', async () => {
  const before = await balance();
  await query("CREATE FUNCTION reject_movement_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='movements' THEN RAISE EXCEPTION 'test movement audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_movement_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_movement_audit();");
  try {
    assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ description: 'Rollback financial movement' }) })).status, 500);
    assert.equal((await query("SELECT count(*) FROM transactions WHERE description='Rollback financial movement'")).rows[0].count, '0');
    assert.equal(await balance(), before);
  } finally { await query('DROP TRIGGER reject_movement_audit ON audit_log; DROP FUNCTION reject_movement_audit();'); }
});

test('Base movement edits preserve omitted and identical historical links after disabling modules', async () => {
  const created = await request('/api/transactions', { method: 'POST', body: movement({ job_id: job, property_id: property }) }); assert.equal(created.status, 201);
  await plan([{ module: 'jobs', state: 'disabled' }, { module: 'real_estate', state: 'read_only' }]);
  const before = await balance();
  const edited = await request(`/api/transactions/${created.body.id}`, { method: 'PUT', body: movement({ description: 'Base edit' }, 25) });
  assert.equal(edited.status, 200); assert.equal(edited.body.job_id, job); assert.equal(edited.body.property_id, property);
  assert.equal(await balance(), before + 5);
  const identical = await request(`/api/transactions/${created.body.id}`, { method: 'PUT', body: movement({ jobId: String(job), property_id: property }, 25) });
  assert.equal(identical.status, 200);
  assert.equal((await stored(created.body.id)).job_id, job);
});

test('assignment, explicit removal and deletion of linked movements are denied without modifying balances', async () => {
  const created = await request('/api/transactions', { method: 'POST', body: movement({ job_id: job, property_id: property }) });
  await plan([{ module: 'jobs', state: 'read_only' }, { module: 'real_estate', state: 'disabled' }]);
  const before = await balance(), original = await stored(created.body.id);
  for (const patch of [{ job_id: null }, { propertyId: null }, { job_id: otherJob }]) {
    const result = await request(`/api/transactions/${created.body.id}`, { method: 'PUT', body: movement(patch, 40) });
    assert.equal(result.status, 403);
  }
  assert.equal((await request(`/api/transactions/${created.body.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ job_id: job }) })).body.error_code, 'MODULE_READ_ONLY');
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ property_id: property, states: { real_estate: 'enabled' }, permissionGranted: true }) })).body.error_code, 'MODULE_DISABLED');
  assert.deepEqual(await stored(created.body.id), original); assert.equal(await balance(), before);
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ job_id: null, propertyId: null }) })).status, 201);
});

test('conflicting aliases cannot bypass an explicit removal; company-external references are denied', async () => {
  const created = await request('/api/transactions', { method: 'POST', body: movement({ job_id: job }) });
  const before = await balance();
  const conflict = await request(`/api/transactions/${created.body.id}`, { method: 'PUT', body: movement({ job_id: null, jobId: job }, 50) });
  assert.equal(conflict.status, 400);
  assert.equal((await stored(created.body.id)).job_id, job); assert.equal(await balance(), before);
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ job_id: otherJob }) })).status, 400);
  assert.equal(await balance(), before);
});

test('Base lists/CSV preserve totals and minimal historical labels; module filters require read access', async () => {
  await request('/api/transactions', { method: 'POST', body: movement({ job_id: job, property_id: property }) });
  const before = await request('/api/transactions?limit=200');
  await plan([{ module: 'jobs', state: 'disabled' }, { module: 'real_estate', state: 'disabled' }]);
  const after = await request('/api/transactions?limit=200');
  assert.equal(after.status, 200); assert.equal(after.total, before.total);
  const historical = after.body.find(item => item.job_id === job && item.property_id === property);
  assert.equal(historical.job_name, 'Historical job'); assert.equal(historical.property_name, 'Historical property');
  const text = JSON.stringify(after.body); assert.ok(!text.includes('Private address')); assert.ok(!text.includes('Private budget notes')); assert.ok(!text.includes('Private property notes'));
  const csv = await request('/api/transactions/export'); assert.equal(csv.status, 200); assert.ok(csv.body.includes('Historical job'));
  for (const filters of [`job_id=${job}`, `property_id=${property}`, 'missing_job=1', 'missing_property=1']) {
    assert.equal((await request(`/api/transactions?${filters}`)).status, 403);
    assert.equal((await request(`/api/transactions/export?${filters}`)).status, 403);
  }
  await plan([{ module: 'jobs', state: 'read_only' }, { module: 'real_estate', state: 'read_only' }]);
  assert.equal((await request(`/api/transactions?job_id=${job}`)).status, 200);
  assert.equal((await request(`/api/transactions/export?property_id=${property}`)).status, 200);
});

test('reenabling a module restores existing entities and links without duplicating data', async () => {
  const created = await request('/api/transactions', { method: 'POST', body: movement({ property_id: property }) });
  const count = (await query('SELECT count(*) FROM properties WHERE company_id=$1', [company])).rows[0].count;
  await plan([{ module: 'real_estate', state: 'disabled' }]);
  await plan([{ module: 'real_estate', state: 'enabled' }]);
  assert.equal((await request(`/api/properties/${property}`)).status, 200);
  assert.equal((await stored(created.body.id)).property_id, property);
  assert.equal((await query('SELECT count(*) FROM properties WHERE company_id=$1', [company])).rows[0].count, count);
  assert.equal((await request(`/api/transactions/${created.body.id}`, { method: 'PUT', body: movement({ property_id: null }) })).status, 200);
  assert.equal((await stored(created.body.id)).property_id, null);
});

test('a missing optional registry row fails closed while Base movements remain usable', async () => {
  await query("DELETE FROM company_modules WHERE company_id=$1 AND module_code='jobs'", [company]);
  assert.equal((await request('/api/jobs')).body.error_code, 'MODULE_DISABLED');
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement() })).status, 201);
  assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ job_id: job }) })).body.error_code, 'MODULE_DISABLED');
});

test('HTTP writer holds the company lock until commit; queued revocation rejects subsequent linked writes', async () => {
  const blocker = await getClient();
  let write, transition;
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [account]);
    write = request('/api/transactions', { method: 'POST', body: movement({ job_id: job }) });
    await waitForLock('%FROM accounts%FOR UPDATE%');
    transition = plan([{ module: 'jobs', state: 'read_only' }]);
    await waitForLock('SELECT modules_version FROM companies WHERE id=$1 FOR UPDATE%');
    assert.equal((await readCompanyModules(company)).modules.find(item => item.code === 'jobs').state, 'enabled');
    await blocker.query('COMMIT');
    const completed = await write; assert.equal(completed.status, 201);
    await transition;
    assert.equal((await stored(completed.body.id)).job_id, job);
    const before = await balance();
    assert.equal((await request('/api/transactions', { method: 'POST', body: movement({ job_id: job }) })).body.error_code, 'MODULE_READ_ONLY');
    assert.equal(await balance(), before);
  } finally {
    await blocker.query('ROLLBACK'); blocker.release();
    await Promise.allSettled([write, transition].filter(Boolean));
  }
});
