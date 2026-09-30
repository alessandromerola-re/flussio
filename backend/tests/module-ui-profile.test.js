import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { query, resetDb, close } from './_db.js';
import { applyCompanyModulePlan, readCompanyModules } from '../src/modules/registry.js';
let server, base, company, other, admin, elevated;
const request = async ({ actor=admin, target=company, claims={}, header=true }={}) => {
  const response = await fetch(`${base}/api/modules/current`, { headers: {
    Authorization: `Bearer ${jwt.sign({ user_id: actor, default_company_id: company, ...claims }, process.env.JWT_SECRET)}`,
    ...(header ? { 'X-Company-Id': String(target) } : {}),
  } });
  return { status: response.status, body: await response.json() };
};
const plan = async changes => applyCompanyModulePlan({ companyId: company, actorUserId: elevated,
  expectedVersion: (await readCompanyModules(company)).version, reason: 'UI profile test', changes });
test.before(async () => {
  process.env.JWT_SECRET ||= 'module_ui_test'; server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async () => {
  await resetDb({ modules: true });
  company = (await query("INSERT INTO companies(name) VALUES ('Profile A') RETURNING id")).rows[0].id;
  other = (await query("INSERT INTO companies(name) VALUES ('Profile B') RETURNING id")).rows[0].id;
  admin = (await query("INSERT INTO users(company_id,email,password_hash,role) VALUES ($1,'profile@test.it','unused','admin') RETURNING id", [company])).rows[0].id;
  elevated = (await query("INSERT INTO users(company_id,email,password_hash,role,is_super_admin) VALUES ($1,'super@test.it','unused','admin',true) RETURNING id", [company])).rows[0].id;
  await query("INSERT INTO user_companies(user_id,company_id,role) VALUES ($1,$2,'admin')", [admin, company]);
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); await close(); });

test('current profile is coherent with registry version and legacy enabled modules', async () => {
  const result = await request({ header: false }); assert.equal(result.status, 200);
  assert.equal(result.body.company_id, company); assert.equal(result.body.version, '1');
  assert.equal(result.body.enforcement_ready, false); assert.equal(result.body.role, 'admin');
  for (const cap of ['finance', 'general_reports', 'recurring', 'jobs', 'job_links', 'properties', 'property_reports']) {
    assert.equal(result.body.capabilities[cap].read, true); assert.equal(result.body.capabilities[cap].write, true);
  }
  const snapshot = await readCompanyModules(company); assert.deepEqual(result.body.modules, snapshot.modules);
  for (const module of snapshot.modules.filter(row => !row.available)) assert.equal(module.state, 'disabled');
});
test('disabled and read-only capabilities are computed server-side without a superadmin bypass', async () => {
  await plan([{ module: 'jobs', state: 'read_only' }, { module: 'real_estate', state: 'disabled' }]);
  for (const actor of [admin, elevated]) {
    const result = await request({ actor, claims: { states: { jobs: 'enabled' }, capabilities: { properties: { read: true } } } });
    assert.equal(result.status, 200); assert.equal(result.body.version, '2');
    for (const cap of ['jobs','job_links','job_reports']) {
      assert.equal(result.body.capabilities[cap].read, true); assert.equal(result.body.capabilities[cap].export, true);
      for (const action of ['write','delete','import','import_movements']) assert.equal(result.body.capabilities[cap][action], false);
    }
    assert.ok(Object.values(result.body.capabilities.properties).every(value => value === false));
    assert.equal(result.body.capabilities.finance.write, true);
  }
});
test('roles are reread from membership, with separate export/import/delete rights', async () => {
  for (const [role, write, exports, deletes, imports, movementImports] of [
    ['viewer', false, false, false, false, false], ['operatore', true, false, false, false, false],
    ['editor', true, true, true, true, false], ['admin', true, true, true, true, true],
  ]) {
    await query('UPDATE user_companies SET role=$1 WHERE user_id=$2 AND company_id=$3', [role, admin, company]);
    const result = await request({ claims: { role: 'super_admin' } }); assert.equal(result.status, 200);
    assert.equal(result.body.role, role);
    assert.deepEqual(result.body.capabilities.jobs, { read: true, write, delete: deletes, export: exports, import: imports, import_movements: movementImports });
  }
});
test('company selection uses verified memberships and cannot expose foreign capabilities', async () => {
  assert.equal((await request({ target: other })).status, 403);
  await query("INSERT INTO user_companies(user_id,company_id,role) VALUES ($1,$2,'viewer')", [admin, other]);
  await plan([{ module: 'jobs', state: 'disabled' }]);
  const foreign = await request({ target: other }); assert.equal(foreign.status, 200);
  assert.equal(foreign.body.company_id, other); assert.equal(foreign.body.role, 'viewer');
  assert.equal(foreign.body.capabilities.jobs.read, true); assert.equal(foreign.body.capabilities.jobs.write, false);
  assert.equal((await request()).body.capabilities.jobs.read, false);
  await query('UPDATE user_companies SET is_active=false WHERE user_id=$1 AND company_id=$2', [admin, other]);
  assert.equal((await request({ target: other })).status, 403);
});
test('missing optional rows and unavailable catalog entries deny all capabilities', async () => {
  await query('DELETE FROM company_modules WHERE company_id=$1', [company]);
  const result = await request(); assert.equal(result.status, 200);
  assert.equal(result.body.capabilities.finance.write, true);
  for (const [cap, actions] of Object.entries(result.body.capabilities)) {
    if (!['finance','general_reports','recurring'].includes(cap)) assert.ok(Object.values(actions).every(value => value === false), cap);
  }
});
