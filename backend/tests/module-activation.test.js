import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { query, resetDb, close } from './_db.js';
import { getClient } from '../src/db/index.js';
import { readCompanyModules, applyCompanyModulePlan } from '../src/modules/registry.js';
import { runMigrations } from '../src/db/migrate.js';
import { ensureBootstrapAdmin } from '../src/bootstrapAdmin.js';
let server, base, company, other, admin, viewer, elevated;
const request = async (route, { actor=admin, method='GET', body, header=company, claims={} }={}) => {
  const response = await fetch(`${base}${route}`, { method, headers: {
    Authorization: `Bearer ${jwt.sign({user_id:actor,default_company_id:company,...claims},process.env.JWT_SECRET)}`,
    'X-Company-Id':String(header), ...(body===undefined?{}:{'Content-Type':'application/json'}),
  }, ...(body===undefined?{}:{body:JSON.stringify(body)}) });
  return {status:response.status,body:response.status===204?null:(response.headers.get('content-type')||'').includes('json')?await response.json():await response.text()};
};
const apply = async (changes, {target=company,actor=elevated,...extra}={}) => request(`/api/companies/${target}/modules/apply`, {
  actor,method:'POST',body:{expected_version:(await readCompanyModules(target)).version,reason:'Module activation test',changes,...extra},
});
const eventCount = async target => Number((await query('SELECT count(*) FROM company_module_events WHERE company_id=$1',[target])).rows[0].count);
const waitForTransition = async () => {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    const waiting=await query("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%modules_version FROM companies WHERE id=%FOR UPDATE%'");
    if(Number(waiting.rows[0].count))return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('Transition did not reach company lock');
};
test.before(async()=>{
  process.env.JWT_SECRET ||= 'activation_test';server=app.listen(0);
  await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async()=>{
  await resetDb({modules:true});
  company=(await query("INSERT INTO companies(name) VALUES ('Base A') RETURNING id")).rows[0].id;
  other=(await query("INSERT INTO companies(name) VALUES ('Base B') RETURNING id")).rows[0].id;
  const user=async(role,superadmin=false)=>(await query("INSERT INTO users(company_id,email,password_hash,role,is_super_admin) VALUES ($1,$2,'unused',$3,$4) RETURNING id",[company,`${role}${superadmin}@activation.test`,role,superadmin])).rows[0].id;
  admin=await user('admin');viewer=await user('viewer');elevated=await user('admin',true);
  await query("INSERT INTO user_companies(user_id,company_id,role) VALUES ($1,$3,'admin'),($2,$3,'viewer')",[admin,viewer,company]);
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));await close();});

test('fresh SQL and API companies use Base only, including seeded defaults',async()=>{
  const profile=await request('/api/modules/current');assert.equal(profile.status,200);
  assert.equal(profile.body.version,'0');assert.equal(profile.body.enforcement_ready,true);
  assert.equal(profile.body.capabilities.finance.write,true);assert.equal(profile.body.capabilities.jobs.read,false);
  assert.equal((await request('/api/jobs')).body.error_code,'MODULE_DISABLED');
  const created=await request('/api/companies',{actor:elevated,method:'POST',body:{name:'API Base',seed_defaults:true}});
  assert.equal(created.status,201);const id=created.body.company.id;
  const snapshot=await readCompanyModules(id);assert.equal(snapshot.version,'0');
  assert.deepEqual(snapshot.modules.filter(row=>row.state==='enabled').map(row=>row.code),['core']);
  assert.equal(await eventCount(id),0);
  assert.equal((await query('SELECT count(*) FROM accounts WHERE company_id=$1',[id])).rows[0].count,'3');
  assert.equal((await request('/api/properties',{actor:elevated,header:id})).body.error_code,'MODULE_DISABLED');
  assert.equal((await query("SELECT count(*) FROM pg_trigger WHERE tgname='companies_provision_legacy_modules'")).rows[0].count,'0');
});
test('a public multi-module plan targets the URL company and atomically audits the verified actor',async()=>{
  const response=await request(`/api/companies/${company}/modules/apply`,{actor:elevated,header:other,method:'POST',body:{
    expected_version:'0',reason:'  Customer request  ',changes:[{module:'jobs',state:'enabled'},{module:'real_estate',state:'enabled'}],
    company_id:other,actor_user_id:admin,states:{wealth:'enabled'},capabilities:['wealth'],
  }});
  assert.equal(response.status,200);assert.equal(response.body.company_id,company);assert.equal(response.body.version,'1');
  assert.ok(response.body.operation_id);assert.equal((await readCompanyModules(other)).version,'0');
  const events=(await query('SELECT * FROM company_module_events WHERE operation_id=$1',[response.body.operation_id])).rows;
  assert.equal(events.length,2);assert.ok(events.every(event=>event.company_id===company&&event.actor_user_id===elevated&&event.reason==='Customer request'&&event.company_version==='1'));
  assert.ok((await readCompanyModules(company)).modules.filter(row=>!row.available).every(row=>row.state==='disabled'));
});
test('direct HTTP application rejects roles, malformed plans, immutable Base, future modules and stale versions',async()=>{
  for(const actor of [admin,viewer])assert.equal((await request(`/api/companies/${company}/modules/apply`,{actor,claims:{is_super_admin:true},method:'POST',body:{expected_version:'0',reason:'Test',changes:[{module:'jobs',state:'enabled'}]}})).status,403);
  const valid={expected_version:'0',reason:'Test',changes:[{module:'jobs',state:'enabled'}]};
  for(const body of [[],{...valid,reason:' '},{...valid,reason:'x'.repeat(1001)},{...valid,expected_version:0}]){
    const result=await request(`/api/companies/${company}/modules/apply`,{actor:elevated,method:'POST',body});assert.equal(result.status,400);assert.equal(result.body.error_code,'MODULE_PLAN_INVALID');
  }
  for(const changes of [undefined,null,{},[],[{module:'jobs',state:'invalid'}],[{module:'jobs',state:'enabled'},{module:'jobs',state:'disabled'}]]){
    for(const action of ['preview','apply']){
      const result=await request(`/api/companies/${company}/modules/${action}`,{actor:elevated,method:'POST',body:{...valid,changes}});
      assert.equal(result.status,400,`${action}: ${JSON.stringify(changes)}`);assert.equal(result.body.error_code,'MODULE_PLAN_INVALID');
    }
  }
  assert.equal((await request(`/api/companies/${company}/modules/apply`,{actor:elevated,method:'POST',body:null})).status,400);
  for(const [changes,code] of [[[{module:'core',state:'disabled'}],'MODULE_CORE_IMMUTABLE'],[[{module:'wealth',state:'enabled'}],'MODULE_UNAVAILABLE'],[[{module:'unknown',state:'enabled'}],'MODULE_UNKNOWN']]){
    const result=await apply(changes);assert.equal(result.status,409);assert.equal(result.body.error_code,code);
  }
  assert.equal((await apply(valid.changes,{expected_version:'1'})).body.error_code,'MODULE_VERSION_CONFLICT');
  assert.equal(await eventCount(company),0);assert.equal((await readCompanyModules(company)).version,'0');
  await query('UPDATE users SET is_super_admin=false WHERE id=$1',[elevated]);
  assert.equal((await apply(valid.changes)).status,403);
});
test('no-op plans do not increment version or add audit and a no-op preview cannot apply',async()=>{
  const response=await apply([{module:'jobs',state:'disabled'}]);assert.equal(response.status,200);
  assert.equal(response.body.operation_id,null);assert.equal(response.body.version,'0');assert.equal(await eventCount(company),0);
  const preview=await request(`/api/companies/${company}/modules/preview`,{actor:elevated,method:'POST',body:{expected_version:'0',changes:[{module:'jobs',state:'disabled'}]}});
  assert.equal(preview.body.can_apply,false);assert.deepEqual(preview.body.impact,[]);
});
test('public transitions preserve historical links, balances, saved reports and immutable CSV through reactivation',async()=>{
  assert.equal((await apply([{module:'jobs',state:'enabled'},{module:'real_estate',state:'enabled'}])).status,200);
  const job=(await request('/api/jobs',{method:'POST',body:{title:'Retained job'}}));assert.equal(job.status,201);
  const property=await request('/api/properties',{method:'POST',body:{name:'Retained property'}});assert.equal(property.status,201);
  const account=(await query("INSERT INTO accounts(company_id,name,type,opening_balance,balance) VALUES ($1,'Bank','bank',0,0) RETURNING id",[company])).rows[0].id;
  const payload={date:'2026-09-30',type:'expense',amount_total:10,description:'Retained movement',job_id:job.body.id,property_id:property.body.id,accounts:[{account_id:account,direction:'out',amount:10}]};
  const movement=await request('/api/transactions',{method:'POST',body:payload});assert.equal(movement.status,201);
  const template=await request('/api/recurring-templates',{method:'POST',body:{title:'Retained recurrence',frequency:'monthly',interval:1,start_date:'2026-10-01',amount:10,movement_type:'expense',account_id:account,job_id:job.body.id,property_id:property.body.id}});assert.equal(template.status,201);
  const spec={dateFrom:'2026-09-01',dateTo:'2026-09-30',groupBy:['job'],filters:{type:'all'}};
  const saved=await request('/api/reports/advanced/saved',{method:'POST',body:{name:'Retained report',spec_json:spec,is_shared:true}});assert.equal(saved.status,201);
  const report=await request('/api/reports/advanced/run',{method:'POST',body:spec});assert.equal(report.status,200);
  const frozen={snapshot_id:report.body.export_snapshot.id};
  const csv=await request('/api/reports/advanced/export.csv',{method:'POST',body:frozen});assert.equal(csv.status,200);
  const preview=await request(`/api/companies/${company}/modules/preview`,{actor:elevated,method:'POST',body:{expected_version:'1',changes:[{module:'jobs',state:'read_only'}]}});
  assert.equal(preview.body.can_apply,true);assert.deepEqual(preview.body.impact,[{module:'jobs',from:'enabled',to:'read_only',records:'1',linked_movements:'1',active_recurring:'1'}]);
  assert.equal((await apply([{module:'jobs',state:'read_only'},{module:'real_estate',state:'read_only'}])).status,200);
  assert.equal((await request('/api/jobs')).status,200);assert.equal((await request('/api/jobs',{method:'POST',body:{title:'Blocked'}})).body.error_code,'MODULE_READ_ONLY');
  assert.equal((await request(`/api/transactions/${movement.body.id}`,{method:'DELETE'})).body.error_code,'MODULE_READ_ONLY');
  const basePayload={...payload,description:'Base edit'};delete basePayload.job_id;delete basePayload.property_id;
  assert.equal((await request(`/api/transactions/${movement.body.id}`,{method:'PUT',body:basePayload})).status,200);
  assert.equal((await request(`/api/reports/advanced/saved/${saved.body.id}`,{method:'PUT',body:{name:'Base replacement',spec_json:{...spec,groupBy:[]},is_shared:true}})).body.error_code,'MODULE_READ_ONLY');
  const recurring=await request('/api/recurring-templates');assert.equal(recurring.body[0].module_suspension.code,'MODULE_READ_ONLY');
  assert.deepEqual(await request('/api/reports/advanced/export.csv',{method:'POST',body:frozen}),csv);
  assert.equal((await apply([{module:'jobs',state:'disabled'},{module:'real_estate',state:'disabled'}])).status,200);
  assert.equal((await request('/api/jobs')).body.error_code,'MODULE_DISABLED');
  assert.equal((await request('/api/reports/advanced/export.csv',{method:'POST',body:frozen})).body.error_code,'MODULE_DISABLED');
  const baseReport=await request('/api/reports/advanced/run',{method:'POST',body:{...spec,groupBy:[]}});assert.equal(Number(baseReport.body.totals.net_sum_cents),-1000);
  const stored=(await query('SELECT job_id,property_id FROM transactions WHERE id=$1',[movement.body.id])).rows[0];assert.deepEqual(stored,{job_id:job.body.id,property_id:property.body.id});
  assert.equal(Number((await query('SELECT balance FROM accounts WHERE id=$1',[account])).rows[0].balance),-10);
  assert.equal((await request('/api/reports/advanced/saved')).body[0].spec_json,null);
  const restored=await apply([{module:'jobs',state:'enabled'},{module:'real_estate',state:'enabled'}]);assert.equal(restored.body.version,'4');
  for(const table of ['jobs','properties','transactions','recurring_templates','saved_reports'])assert.equal((await query(`SELECT count(*) FROM ${table} WHERE company_id=$1`,[company])).rows[0].count,'1',table);
  assert.deepEqual(await request('/api/reports/advanced/export.csv',{method:'POST',body:frozen}),csv);
});
test('two HTTP plans at one version produce one commit and one conflict',async()=>{
  const responses=await Promise.all([apply([{module:'jobs',state:'enabled'}],{expected_version:'0'}),apply([{module:'real_estate',state:'enabled'}],{expected_version:'0'})]);
  assert.deepEqual(responses.map(result=>result.status).sort(),[200,409]);assert.equal(await eventCount(company),1);assert.equal((await readCompanyModules(company)).version,'1');
});
test('an audit failure rolls back the entire public plan',async()=>{
  await query("CREATE FUNCTION reject_activation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER reject_activation_audit BEFORE INSERT ON company_module_events FOR EACH ROW EXECUTE FUNCTION reject_activation_audit();");
  try {assert.equal((await apply([{module:'jobs',state:'enabled'},{module:'real_estate',state:'enabled'}])).status,500);}
  finally {await query('DROP TRIGGER reject_activation_audit ON company_module_events; DROP FUNCTION reject_activation_audit();');}
  assert.equal((await readCompanyModules(company)).version,'0');assert.equal(await eventCount(company),0);
  assert.ok((await readCompanyModules(company)).modules.filter(row=>row.code!=='core').every(row=>row.state==='disabled'));
});
test('superadmin authority is reread after waiting for the company transition lock',async()=>{
  const writer=await getClient();let pending;
  try {
    await writer.query('BEGIN');await writer.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[company]);
    pending=apply([{module:'jobs',state:'enabled'}]);await waitForTransition();
    await query('UPDATE users SET is_super_admin=false WHERE id=$1',[elevated]);await writer.query('COMMIT');
    assert.equal((await pending).status,403);assert.equal(await eventCount(company),0);assert.equal((await readCompanyModules(company)).version,'0');
  } finally {await writer.query('ROLLBACK');writer.release();if(pending)await pending;}
});
test('migration 017 preserves legacy enabled, disabled and read-only states and retires provisioning idempotently',async()=>{
  await resetDb();const legacy=(await query("INSERT INTO companies(name) VALUES ('Upgrade legacy') RETURNING id")).rows[0].id;
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'flussio-before-017-'));
  try {
    const source=new URL('../migrations/',import.meta.url);
    for(const filename of await fs.readdir(source))if(!filename.startsWith('017_'))await fs.copyFile(new URL(filename,source),path.join(directory,filename));
    await runMigrations({migrationsDir:directory});
    const actor=(await query("INSERT INTO users(company_id,email,password_hash,role,is_super_admin) VALUES ($1,'upgrade@activation.test','unused','admin',true) RETURNING id",[legacy])).rows[0].id;
    const during=(await query("INSERT INTO companies(name) VALUES ('Before activation') RETURNING id")).rows[0].id;
    await query("INSERT INTO accounts(company_id,name,type,opening_balance,balance) VALUES ($1,'Legacy bank','bank',100,100)",[legacy]);
    await applyCompanyModulePlan({companyId:legacy,actorUserId:actor,expectedVersion:'1',reason:'Preserve states',changes:[{module:'jobs',state:'read_only'},{module:'real_estate',state:'disabled'}]});
    const before=await readCompanyModules(legacy),compat=await readCompanyModules(during),events=await eventCount(legacy);
    await runMigrations();assert.deepEqual(await readCompanyModules(legacy),before);assert.deepEqual(await readCompanyModules(during),compat);
    const sql=await fs.readFile(new URL('../migrations/017_20260930__activate_company_modules.sql',import.meta.url),'utf8');
    assert.equal(sql,await fs.readFile(new URL('../../database/migrations/017_20260930__activate_company_modules.sql',import.meta.url),'utf8'));
    await query(sql);await runMigrations();assert.deepEqual(await readCompanyModules(legacy),before);assert.equal(await eventCount(legacy),events);
    assert.equal(Number((await query('SELECT balance FROM accounts WHERE company_id=$1',[legacy])).rows[0].balance),100);
    const fresh=(await query("INSERT INTO companies(name) VALUES ('After activation') RETURNING id")).rows[0].id;
    assert.deepEqual((await readCompanyModules(fresh)).modules.filter(row=>row.state==='enabled').map(row=>row.code),['core']);
    assert.equal((await query("SELECT to_regprocedure('provision_legacy_company_modules(integer)') AS legacy")).rows[0].legacy,null);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
test('fresh bootstrap admin creation also uses Base-only provisioning',async()=>{
  await resetDb({modules:true});
  const names=['BOOTSTRAP_ADMIN_EMAIL','BOOTSTRAP_ADMIN_PASSWORD','BOOTSTRAP_COMPANY_NAME'];const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    process.env.BOOTSTRAP_ADMIN_EMAIL='bootstrap@activation.test';process.env.BOOTSTRAP_ADMIN_PASSWORD='synthetic-bootstrap-test-password';process.env.BOOTSTRAP_COMPANY_NAME='Bootstrap Base';
    await ensureBootstrapAdmin();
    const row=(await query("SELECT company_id FROM users WHERE email='bootstrap@activation.test'")).rows[0];assert.ok(row);
    const snapshot=await readCompanyModules(row.company_id);assert.equal(snapshot.version,'0');assert.deepEqual(snapshot.modules.filter(module=>module.state==='enabled').map(module=>module.code),['core']);
    assert.equal(await eventCount(row.company_id),0);
  } finally {for(const name of names)if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
});
