import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { query, resetDb, close } from './_db.js';
import { getClient } from '../src/db/index.js';
import { applyCompanyModulePlan, readCompanyModules } from '../src/modules/registry.js';
let server, base, company, other, admin, editor, viewer, superadmin, job, property, foreignJob, foreignProperty;
const request = async (path, { actor=admin, target=company, method='GET', body }={}) => {
  const res=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${jwt.sign({user_id:actor,default_company_id:company},process.env.JWT_SECRET)}`,'X-Company-Id':String(target),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,body:method==='HEAD'||res.status===204?null:(res.headers.get('content-type')||'').includes('json')?await res.json():await res.text()};
};
const spec = extra => ({dateFrom:'2026-09-01',dateTo:'2026-09-30',groupBy:[],filters:{type:'all'},...extra});
const run = (input, options={}) => request('/api/reports/advanced/run',{method:'POST',body:input,...options});
const csv = (input, options={}) => request('/api/reports/advanced/export.csv',{method:'POST',body:input,...options});
const save = (input, options={}) => request('/api/reports/advanced/saved',{method:'POST',body:{name:'Saved',spec_json:input,is_shared:true},...options});
const plan = async (changes,target=company) => applyCompanyModulePlan({companyId:target,actorUserId:superadmin,expectedVersion:(await readCompanyModules(target)).version,reason:'Report enforcement test',changes});
const waitForLock = async (pattern,count=1) => {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){if(Number((await query("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE $1",[pattern])).rows[0].count)>=count)return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail(`Lock barrier not reached: ${pattern}`);
};
test.before(async()=>{process.env.JWT_SECRET||='module_report_test';server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;});
test.beforeEach(async()=>{
  await resetDb({modules:true});
  company=(await query("INSERT INTO companies(name) VALUES ('Report A') RETURNING id")).rows[0].id;
  other=(await query("INSERT INTO companies(name) VALUES ('Report B') RETURNING id")).rows[0].id;
  const user=async(role,elevated=false)=>(await query("INSERT INTO users(company_id,email,password_hash,role,is_super_admin) VALUES ($1,$2,'unused',$3,$4) RETURNING id",[company,`${role}${elevated}@reports.test`,role,elevated])).rows[0].id;
  admin=await user('admin');editor=await user('editor');viewer=await user('viewer');superadmin=await user('admin',true);
  await query("INSERT INTO user_companies(user_id,company_id,role,is_active) VALUES ($1,$4,'admin',true),($2,$4,'editor',true),($3,$4,'viewer',true)",[admin,editor,viewer,company]);
  job=(await query("INSERT INTO jobs(company_id,name,title,expected_revenue_cents) VALUES ($1,'Job A','Job A',10000) RETURNING id",[company])).rows[0].id;
  property=(await query("INSERT INTO properties(company_id,name) VALUES ($1,'House A') RETURNING id",[company])).rows[0].id;
  foreignJob=(await query("INSERT INTO jobs(company_id,name,title) VALUES ($1,'Private Job B','Private Job B') RETURNING id",[other])).rows[0].id;
  foreignProperty=(await query("INSERT INTO properties(company_id,name) VALUES ($1,'Private House B') RETURNING id",[other])).rows[0].id;
  await query("INSERT INTO transactions(company_id,date,type,amount_total,job_id,property_id) VALUES ($1,'2026-09-01','income',100,$2,$3),($1,'2026-09-02','expense',-20,NULL,NULL)",[company,job,property]);
  await query("INSERT INTO transactions(company_id,date,type,amount_total,job_id,property_id) VALUES ($1,'2026-09-01','income',999,$2,$3)",[other,foreignJob,foreignProperty]);
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));await close();});

for(const [module,dimension,filter] of [['jobs','job','job_id'],['real_estate','property','property_id']]){
  test(`${module} guards normalized groups and aliases for run, legacy CSV and saved creation`,async()=>{
    await plan([{module,state:'read_only'}]);
    const grouped=spec({groupBy:[dimension]});assert.equal((await run(grouped)).status,200);assert.equal((await csv(grouped)).status,200);
    assert.equal((await save(grouped)).body.error_code,'MODULE_READ_ONLY');
    await plan([{module,state:'disabled'}]);
    for(const input of [grouped,spec({filters:{[filter]:dimension==='job'?job:property}})]){
      for(const call of [run,csv,save]){const result=await call({...input,capabilities:['general_reports'],states:{[module]:'enabled'}});assert.equal(result.status,403);assert.equal(result.body.error_code,'MODULE_DISABLED');}
    }
    assert.equal((await run(grouped,{actor:superadmin})).body.error_code,'MODULE_DISABLED');
  });
}
test('quality and budget enforce implicit requirements while Base comparisons remain available',async()=>{
  await plan([{module:'jobs',state:'disabled'},{module:'real_estate',state:'disabled'}]);
  for(const input of [spec({reportKind:'budget',groupBy:['job']}),spec({reportKind:'quality',qualityDimensions:['job']}),spec({reportKind:'quality',qualityDimensions:['property']})]){
    assert.equal((await run(input)).body.error_code,'MODULE_DISABLED');assert.equal((await csv(input)).status,403);
  }
  for(const input of [spec(),spec({reportKind:'quality'}),spec({reportKind:'yoy',groupBy:['month']}),spec({reportKind:'mom',groupBy:['month'],filters:{type:'expense'}})])assert.equal((await run(input)).status,200);
  assert.equal((await save(spec())).status,201);
});
test('Base totals and dashboard include linked movements while optional dimensions are blocked',async()=>{
  await plan([{module:'jobs',state:'disabled'},{module:'real_estate',state:'disabled'}]);
  const report=await run(spec());assert.equal(Number(report.body.totals.income_sum_cents),10000);assert.equal(Number(report.body.totals.net_sum_cents),8000);
  const summary=await request('/api/dashboard/summary?from=2026-09-01&to=2026-09-30');assert.equal(summary.body.net_sum_cents,8000);assert.equal(summary.body.count,2);
  for(const dimension of ['category','contact','account']){const pie=await request('/api/dashboard/pie',{method:'POST',body:{from:'2026-09-01',to:'2026-09-30',dimension,kind:'income'}});assert.equal(pie.body.total_cents,10000);}
  assert.equal((await request('/api/dashboard/pie',{method:'POST',body:{dimension:'job'}})).body.error_code,'MODULE_DISABLED');
  await plan([{module:'jobs',state:'read_only'}]);assert.equal((await request('/api/dashboard/pie',{method:'POST',body:{dimension:'job'}})).status,200);
});
test('job summary and both CSV scopes enforce disabled/read-only including HEAD and roles',async()=>{
  await plan([{module:'jobs',state:'read_only'}]);
  assert.equal((await request(`/api/reports/job/${job}/summary`,{actor:viewer})).status,200);
  assert.equal((await request(`/api/reports/job/${job}/export.csv`,{actor:viewer})).body.error_code,'FORBIDDEN');
  assert.equal((await request(`/api/reports/job/${job}/export.csv`)).status,200);
  await plan([{module:'jobs',state:'disabled'}]);
  for(const suffix of ['summary','export.csv','export.csv?scope=movements'])assert.equal((await request(`/api/reports/job/${job}/${suffix}`,{actor:superadmin})).body.error_code,'MODULE_DISABLED');
  assert.equal((await request(`/api/reports/job/${job}/summary`,{method:'HEAD'})).status,403);
});
test('snapshot authorization is immutable, current and independent of supplied spec; reenabling preserves frozen data',async()=>{
  const displayed=await run(spec({groupBy:['job','property']})),id=displayed.body.export_snapshot.id;
  const frozen=await csv({snapshot_id:id});assert.equal(frozen.status,200);
  await query("UPDATE jobs SET title='Updated job' WHERE id=$1",[job]);
  await plan([{module:'jobs',state:'read_only'}]);assert.deepEqual(await csv({snapshot_id:id}),frozen);
  await plan([{module:'real_estate',state:'disabled'}]);
  const denied=await csv({snapshot_id:id,spec:spec(),capabilities:['general_reports']});assert.equal(denied.status,403);assert.equal(denied.body.error_code,'MODULE_DISABLED');
  await plan([{module:'real_estate',state:'enabled'}]);assert.deepEqual(await csv({snapshot_id:id}),frozen);
  assert.ok((await csv(spec({groupBy:['job','property']}))).body.includes('Updated job'));
});
test('Base snapshots survive optional revocation; snapshots remain isolated by user, company and current role',async()=>{
  const id=(await run(spec())).body.export_snapshot.id;
  await plan([{module:'jobs',state:'disabled'},{module:'real_estate',state:'disabled'}]);assert.equal((await csv({snapshot_id:id})).status,200);
  assert.equal((await csv({snapshot_id:id},{actor:editor})).status,410);assert.equal((await csv({snapshot_id:id},{actor:superadmin,target:other})).status,410);
  assert.equal((await csv({snapshot_id:id},{target:other})).status,403);
  await query("UPDATE user_companies SET role='viewer' WHERE user_id=$1 AND company_id=$2",[admin,company]);
  assert.equal((await csv({snapshot_id:id})).body.error_code,'FORBIDDEN');
});
test('saved configs retain metadata and data but cannot be exposed, replaced or deleted through revoked modules',async()=>{
  const id=(await save(spec({groupBy:['job']}))).body.id;await save(spec());
  await plan([{module:'jobs',state:'read_only'}]);
  let list=await request('/api/reports/advanced/saved');assert.ok(list.body.find(row=>row.id===id).spec_json);assert.equal(list.body.find(row=>row.id===id).module_access.allowed,true);
  for(const state of ['read_only','disabled']){
    await plan([{module:'jobs',state}]);
    const update=await request(`/api/reports/advanced/saved/${id}`,{method:'PUT',body:{name:'Replace by Base',spec_json:spec()}});assert.equal(update.status,403);
    assert.equal((await request(`/api/reports/advanced/saved/${id}`,{method:'DELETE'})).status,403);
  }
  list=await request('/api/reports/advanced/saved');const blocked=list.body.find(row=>row.id===id);assert.equal(blocked.spec_json,null);assert.equal(blocked.module_access.code,'MODULE_DISABLED');
  assert.ok(list.body.some(row=>row.spec_json&&row.module_access.allowed));assert.equal((await query('SELECT count(*) FROM saved_reports WHERE id=$1',[id])).rows[0].count,'1');
  await plan([{module:'jobs',state:'enabled'}]);list=await request('/api/reports/advanced/saved');assert.deepEqual(list.body.find(row=>row.id===id).spec_json.groupBy,['job']);
  assert.equal((await request(`/api/reports/advanced/saved/${id}`,{method:'DELETE'})).status,204);
});
test('saved updates check both old and new modules and preserve ownership/company permissions',async()=>{
  const id=(await save(spec())).body.id;
  await plan([{module:'real_estate',state:'read_only'}]);
  const payload={name:'New property',spec_json:spec({groupBy:['property']})};
  assert.equal((await request(`/api/reports/advanced/saved/${id}`,{method:'PUT',body:payload})).body.error_code,'MODULE_READ_ONLY');
  assert.equal((await request(`/api/reports/advanced/saved/${id}`,{method:'PUT',actor:editor,body:payload})).body.error_code,'FORBIDDEN');
  assert.equal((await request(`/api/reports/advanced/saved/${id}`,{method:'DELETE',target:other,actor:superadmin})).status,404);
  assert.equal((await save(spec(),{actor:viewer})).status,403);
  await query('UPDATE saved_reports SET is_shared=false WHERE id=$1',[id]);assert.equal((await request('/api/reports/advanced/saved',{actor:editor})).body.length,0);
});
test('company-scoped labels never expose malformed foreign links, and missing registry rows deny optional reports',async()=>{
  await query('UPDATE transactions SET job_id=$1,property_id=$2 WHERE company_id=$3 AND type=\'income\'',[foreignJob,foreignProperty,company]);
  const result=await run(spec({groupBy:['job','property']}));assert.equal(result.status,200);assert.ok(!JSON.stringify(result.body).includes('Private Job B'));assert.ok(!JSON.stringify(result.body).includes('Private House B'));
  const pie=await request('/api/dashboard/pie',{method:'POST',body:{from:'2026-09-01',to:'2026-09-30',dimension:'job',kind:'income'}});assert.ok(!JSON.stringify(pie.body).includes('Private Job B'));
  assert.equal((await run(spec(),{target:other})).status,403);
  await query("DELETE FROM company_modules WHERE company_id=$1 AND module_code='jobs'",[company]);assert.equal((await run(spec({groupBy:['job']}))).body.error_code,'MODULE_DISABLED');assert.equal((await run(spec())).status,200);
});
test('a running report holds its company lock through coherent data reads before queued revocation',async()=>{
  const blocker=await getClient();let running,transition;
  try{
    await blocker.query('BEGIN');await blocker.query('LOCK TABLE transactions IN ACCESS EXCLUSIVE MODE');
    running=run(spec({groupBy:['job']}));await waitForLock('%FROM transactions t%');
    await blocker.query("INSERT INTO transactions(company_id,date,type,amount_total,job_id) VALUES ($1,'2026-09-03','income',10,$2)",[company,job]);
    transition=plan([{module:'jobs',state:'disabled'}]);
    await waitForLock('SELECT modules_version FROM companies WHERE id=$1 FOR UPDATE%');await blocker.query('COMMIT');
    const previous=await running;assert.equal(previous.status,200);assert.equal(Number(previous.body.totals.income_sum_cents),10000);
    assert.equal(previous.body.rows.reduce((total,row)=>total+Number(row.income_sum_cents),0),10000);
    await transition;assert.equal((await run(spec({groupBy:['job']}))).body.error_code,'MODULE_DISABLED');
    assert.equal(Number((await run(spec())).body.totals.income_sum_cents),11000);
  }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled([running,transition].filter(Boolean));}
});
test('run and frozen download waiting on revocation retry a stale snapshot and deny access after commit',async()=>{
  const id=(await run(spec({groupBy:['job']}))).body.export_snapshot.id,blocker=await getClient();let transition,running,download;
  await query("CREATE FUNCTION pause_report_module_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(508030); RETURN NEW; END $$; CREATE TRIGGER pause_report_module_change BEFORE UPDATE ON company_modules FOR EACH ROW EXECUTE FUNCTION pause_report_module_change();");
  try{
    await blocker.query('SELECT pg_advisory_lock(508030)');transition=plan([{module:'jobs',state:'disabled'}]);await waitForLock('%INSERT INTO company_modules%');
    running=run(spec({groupBy:['job']}));download=csv({snapshot_id:id});await waitForLock('SELECT modules_version FROM companies WHERE id=$1 FOR SHARE%',2);
    await blocker.query('SELECT pg_advisory_unlock(508030)');await transition;
    for(const result of await Promise.all([running,download])){assert.equal(result.status,403);assert.equal(result.body.error_code,'MODULE_DISABLED');}
  }finally{await blocker.query('SELECT pg_advisory_unlock(508030)');blocker.release();await Promise.allSettled([transition,running,download].filter(Boolean));await query('DROP TRIGGER pause_report_module_change ON company_modules; DROP FUNCTION pause_report_module_change();');}
});
