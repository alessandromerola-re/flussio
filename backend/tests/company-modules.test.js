import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { resetDb, query, close } from './_db.js';
import { getClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { readCompanyModules, applyCompanyModulePlan, lockCompanyModules } from '../src/modules/registry.js';

let company, other, superadmin, admin, viewer, server, base;
const migration = new URL('../migrations/016_20260929__company_module_registry.sql', import.meta.url);
const user = async (email, role, owner, elevated = false) => (await query(`INSERT INTO users(company_id,email,password_hash,role,is_super_admin)
  VALUES ($1,$2,'unused',$3,$4) RETURNING id`, [owner,email,role,elevated])).rows[0].id;
const request = async (path, actor, method='GET', headers={}, body) => {
  const response=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${jwt.sign({user_id:actor,default_company_id:company},process.env.JWT_SECRET)}`,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
};
const change = async (changes, extra={}) => applyCompanyModulePlan({companyId:company,actorUserId:superadmin,
  expectedVersion:(await readCompanyModules(company)).version,reason:'Test transition',changes,...extra});
const countEvents=async()=>Number((await query('SELECT count(*) FROM company_module_events WHERE company_id=$1',[company])).rows[0].count);

test.before(async()=>{
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
  await resetDb();
  company=(await query("INSERT INTO companies(name) VALUES ('Legacy modules') RETURNING id")).rows[0].id;
  await query("INSERT INTO accounts(company_id,name,type,opening_balance,balance) VALUES ($1,'Legacy account','bank',100,100)",[company]);
  await runMigrations();
  other=(await query("INSERT INTO companies(name) VALUES ('New preparatory company') RETURNING id")).rows[0].id;
  superadmin=await user('super@modules.test','admin',company,true);
  admin=await user('admin@modules.test','admin',company);
  viewer=await user('viewer@modules.test','viewer',other);
  await query("INSERT INTO user_companies(user_id,company_id,role,is_active) VALUES ($1,$2,'admin',true),($3,$4,'viewer',true)",[admin,company,viewer,other]);
  server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await close();});

test('migration preserves existing balances and provisions only current optional modules for all companies',async()=>{
  for(const id of [company,other]){
    const state=await readCompanyModules(id);
    assert.equal(state.enforcement_ready,false);assert.equal(state.version,'1');
    assert.deepEqual(state.modules.filter(m=>m.state==='enabled').map(m=>m.code),['core','jobs','real_estate']);
    assert.ok(state.modules.filter(m=>!m.available).every(m=>m.state==='disabled'));
  }
  assert.equal(Number((await query('SELECT balance FROM accounts WHERE company_id=$1',[company])).rows[0].balance),100);
  assert.equal(await countEvents(),2);
  assert.equal((await query('SELECT count(DISTINCT operation_id) FROM company_module_events WHERE company_id=$1',[company])).rows[0].count,'1');
});
test('catalog needs authentication and company reads authorize the URL target rather than a conflicting header',async()=>{
  assert.equal((await fetch(`${base}/api/modules`)).status,401);
  const catalog=await request('/api/modules',admin);assert.equal(catalog.status,200);assert.equal(catalog.data.enforcement_ready,false);
  assert.equal((await request(`/api/companies/${company}/modules`,admin)).status,200);
  assert.equal((await request(`/api/companies/${other}/modules`,admin,'GET',{'X-Company-Id':String(company)})).status,403);
  assert.equal((await request(`/api/companies/${other}/modules`,viewer)).status,200);
  assert.equal((await request(`/api/companies/${other}/modules`,superadmin)).status,200);
  assert.equal((await request('/api/companies/0/modules',superadmin)).status,400);
  assert.equal((await request(`/api/companies/${company}/modules`,admin,'PATCH')).status,404);
});
test('inactive membership denies reads even with matching legacy users.company_id',async()=>{
  await query('UPDATE user_companies SET is_active=false WHERE user_id=$1',[admin]);
  try {assert.equal((await request(`/api/companies/${company}/modules`,admin)).status,403);}
  finally {await query('UPDATE user_companies SET is_active=true WHERE user_id=$1',[admin]);}
});
test('internal transition requires an active database superadmin, reason and exact version',async()=>{
  const before=await countEvents();
  await assert.rejects(change([{module:'jobs',state:'read_only'}],{actorUserId:admin}),{code:'FORBIDDEN'});
  await assert.rejects(change([{module:'jobs',state:'read_only'}],{reason:' '}),{code:'MODULE_PLAN_INVALID'});
  await assert.rejects(change([{module:'jobs',state:'read_only'}],{expectedVersion:'0'}),{code:'MODULE_VERSION_CONFLICT'});
  await query('UPDATE users SET is_active=false WHERE id=$1',[superadmin]);
  try {await assert.rejects(change([{module:'jobs',state:'read_only'}]),{code:'FORBIDDEN'});}
  finally {await query('UPDATE users SET is_active=true WHERE id=$1',[superadmin]);}
  assert.equal(await countEvents(),before);
});
test('successful plan increments company version once and records every actual change in one operation',async()=>{
  const before=await readCompanyModules(company);
  const result=await change([{module:'jobs',state:'read_only'},{module:'real_estate',state:'read_only'}]);
  assert.equal(BigInt(result.version),BigInt(before.version)+1n);
  const events=(await query('SELECT * FROM company_module_events WHERE operation_id=$1',[result.operation_id])).rows;
  assert.equal(events.length,2);assert.ok(events.every(e=>e.actor_user_id===superadmin&&e.previous_state==='enabled'&&e.new_state==='read_only'&&e.company_version===result.version));
  const noop=await change([{module:'jobs',state:'read_only'}]);assert.equal(noop.operation_id,null);assert.equal(noop.version,result.version);
  assert.equal((await readCompanyModules(other)).version,'1');
});
test('invalid plans roll back wholly; SQL constrains core and invalid states',async()=>{
  const before=await readCompanyModules(company), events=await countEvents();
  await assert.rejects(change([{module:'jobs',state:'enabled'},{module:'wealth',state:'enabled'}]),{code:'MODULE_UNAVAILABLE'});
  assert.deepEqual(await readCompanyModules(company),before);assert.equal(await countEvents(),events);
  await assert.rejects(query("INSERT INTO company_modules(company_id,module_code,state) VALUES ($1,'core','disabled')",[company]),{code:'23514'});
  await assert.rejects(query("UPDATE company_modules SET state='invalid' WHERE company_id=$1",[company]),{code:'23514'});
});
test('audit insertion failure rolls back states and version',async()=>{
  const before=await readCompanyModules(company);
  await query(`CREATE FUNCTION reject_test_module_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$;
    CREATE TRIGGER reject_test_module_event BEFORE INSERT ON company_module_events FOR EACH ROW EXECUTE FUNCTION reject_test_module_event();`);
  try {await assert.rejects(change([{module:'jobs',state:'enabled'}]),/test audit failure/);}
  finally {await query('DROP TRIGGER reject_test_module_event ON company_module_events; DROP FUNCTION reject_test_module_event();');}
  assert.deepEqual(await readCompanyModules(company),before);
});
test('concurrent plans at the same version yield one commit and one conflict',async()=>{
  const version=(await readCompanyModules(company)).version;
  const results=await Promise.allSettled([
    change([{module:'jobs',state:'enabled'}],{expectedVersion:version}),
    change([{module:'jobs',state:'disabled'}],{expectedVersion:version}),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'MODULE_VERSION_CONFLICT');
});
test('shared company lock prevents a transition lock until the writer transaction ends',async()=>{
  const writer=await getClient(), transition=await getClient();
  try {
    await writer.query('BEGIN');await lockCompanyModules(writer,company);
    await transition.query('BEGIN');await transition.query("SET LOCAL lock_timeout='100ms'");
    await assert.rejects(lockCompanyModules(transition,company,{exclusive:true}),{code:'55P03'});
    await transition.query('ROLLBACK');await writer.query('COMMIT');
    await transition.query('BEGIN');await lockCompanyModules(transition,company,{exclusive:true});await transition.query('COMMIT');
  } finally {await writer.query('ROLLBACK');await transition.query('ROLLBACK');writer.release();transition.release();}
});
test('migration replay is idempotent and does not reactivate states or duplicate audit',async()=>{
  const before=await readCompanyModules(company),events=await countEvents();
  await query(await fs.readFile(migration,'utf8'));
  await runMigrations();
  assert.deepEqual(await readCompanyModules(company),before);assert.equal(await countEvents(),events);
  assert.equal(await fs.readFile(migration,'utf8'),await fs.readFile(new URL('../../database/migrations/016_20260929__company_module_registry.sql',import.meta.url),'utf8'));
});
test('events cannot be updated, deleted or truncated and survive company deletion',async()=>{
  await assert.rejects(query("UPDATE company_module_events SET reason='rewritten' WHERE company_id=$1",[company]),{code:'23514'});
  await assert.rejects(query('DELETE FROM company_module_events WHERE company_id=$1',[company]),{code:'23514'});
  await assert.rejects(query('TRUNCATE company_module_events'),{code:'23514'});
  const disposable=(await query("INSERT INTO companies(name) VALUES ('Audit retention') RETURNING id")).rows[0].id;
  await query('DELETE FROM companies WHERE id=$1',[disposable]);
  assert.equal((await query('SELECT count(*) FROM company_module_events WHERE company_id=$1',[disposable])).rows[0].count,'2');
  assert.equal((await query('SELECT count(*) FROM company_modules WHERE company_id=$1',[disposable])).rows[0].count,'0');
});


test('module history is administrative, paginated and isolated to the URL company',async()=>{
  const first=await request(`/api/companies/${company}/modules/events?limit=1`,admin);
  assert.equal(first.status,200);assert.equal(first.data.events.length,1);assert.ok(first.data.next_cursor);
  const second=await request(`/api/companies/${company}/modules/events?limit=1&before=${first.data.next_cursor}`,admin);
  assert.equal(second.status,200);assert.equal(second.data.events.length,1);
  assert.ok(BigInt(second.data.events[0].id)<BigInt(first.data.events[0].id));
  assert.equal((await request(`/api/companies/${other}/modules/events`,admin,'GET',{'X-Company-Id':String(company)})).status,403);
  assert.equal((await request(`/api/companies/${other}/modules/events`,viewer)).status,403);
  assert.equal((await request(`/api/companies/${company}/modules/events?limit=101`,admin)).status,400);
  assert.equal((await request(`/api/companies/${company}/modules/events?before=1%3BSELECT`,admin)).status,400);
});
test('superadmin preview counts only target company data and never writes states or events',async()=>{
  const target=(await query("INSERT INTO companies(name) VALUES ('Preview company') RETURNING id")).rows[0].id;
  const job=(await query("INSERT INTO jobs(company_id,name,title) VALUES ($1,'Preview job','Preview job') RETURNING id",[target])).rows[0].id;
  await query("INSERT INTO transactions(company_id,date,type,amount_total,job_id) VALUES ($1,'2026-09-01','income',10,$2)",[target,job]);
  const before=await readCompanyModules(target);
  const events=(await query('SELECT count(*) FROM company_module_events WHERE company_id=$1',[target])).rows[0].count;
  const plan={expected_version:before.version,changes:[{module:'jobs',state:'read_only'}]};
  const result=await request(`/api/companies/${target}/modules/preview`,superadmin,'POST',{},plan);
  assert.equal(result.status,200);assert.equal(result.data.can_apply,false);assert.equal(result.data.enforcement_ready,false);
  assert.deepEqual(result.data.impact,[{module:'jobs',from:'enabled',to:'read_only',records:'1',linked_movements:'1',active_recurring:'0'}]);
  assert.deepEqual(await readCompanyModules(target),before);
  assert.equal((await query('SELECT count(*) FROM company_module_events WHERE company_id=$1',[target])).rows[0].count,events);
});
test('preview denies company admin, stale versions, core changes and unavailable modules',async()=>{
  const version=(await readCompanyModules(company)).version;
  const path=`/api/companies/${company}/modules/preview`;
  const plan={expected_version:version,changes:[{module:'jobs',state:'read_only'}]};
  assert.equal((await request(path,admin,'POST',{},plan)).status,403);
  const stale=await request(path,superadmin,'POST',{}, {...plan,expected_version:'0'});
  assert.equal(stale.status,409);assert.equal(stale.data.error_code,'MODULE_VERSION_CONFLICT');
  const core=await request(path,superadmin,'POST',{}, {...plan,changes:[{module:'core',state:'disabled'}]});
  assert.equal(core.data.error_code,'MODULE_CORE_IMMUTABLE');
  const future=await request(path,superadmin,'POST',{}, {...plan,changes:[{module:'wealth',state:'enabled'}]});
  assert.equal(future.data.error_code,'MODULE_UNAVAILABLE');
  assert.equal((await request(path,superadmin,'POST',{},[])).status,400);
});
