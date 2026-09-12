import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { query, resetDb, close } from './_db.js';
import { reportDrilldownParams } from '../../frontend/src/utils/reportDrilldown.js';
let server, baseUrl, token, company, bank, cash, foreignAccount, parent, child, foreignCategory, split;
const request = async (path, spec) => {
  const response = await fetch(`${baseUrl}/api/reports/advanced/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': String(company), 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
  return { status: response.status, data: path === 'export.csv' ? await response.text() : await response.json() };
};
const spec = (extra = {}) => ({ dateFrom: '2026-09-01', dateTo: '2026-09-30', metrics: ['income_sum_cents','expense_sum_cents','net_sum_cents','count','avg_abs_cents'], groupBy: [], filters: { type: 'all' }, limit: 200, ...extra });
const values = (row) => [Number(row.income_sum_cents), Number(row.expense_sum_cents), Number(row.net_sum_cents), Number(row.count)];
test.before(async () => {
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
  await resetDb();
  company = (await query("INSERT INTO companies(name) VALUES ('Golden') RETURNING id")).rows[0].id;
  const other = (await query("INSERT INTO companies(name) VALUES ('Foreign') RETURNING id")).rows[0].id;
  const user = (await query("INSERT INTO users(company_id,email,password_hash,role) VALUES ($1,'golden@example.test','unused','admin') RETURNING id", [company])).rows[0].id;
  token = jwt.sign({ user_id: user, default_company_id: company }, process.env.JWT_SECRET);
  const account = async (name, owner = company) => (await query("INSERT INTO accounts(company_id,name,type) VALUES ($1,$2,'bank') RETURNING id", [owner, name])).rows[0].id;
  bank = await account('Bank'); cash = await account('Cash'); foreignAccount = await account('Foreign account', other);
  parent = (await query("INSERT INTO categories(company_id,name,direction) VALUES ($1,'Parent','income') RETURNING id", [company])).rows[0].id;
  child = (await query("INSERT INTO categories(company_id,name,parent_id,direction) VALUES ($1,'Child',$2,'income') RETURNING id", [company, parent])).rows[0].id;
  foreignCategory = (await query("INSERT INTO categories(company_id,name,direction) VALUES ($1,'Private foreign category','income') RETURNING id", [other])).rows[0].id;
  const movement = async (type, amount, category, entries, owner = company) => {
    const id = (await query("INSERT INTO transactions(company_id,date,type,amount_total,category_id,description) VALUES ($1,'2026-09-10',$2,$3,$4,'Golden fixture') RETURNING id", [owner,type,amount,category])).rows[0].id;
    for (const [accountId, value, direction = type === 'expense' ? 'out' : 'in'] of entries) await query('INSERT INTO transaction_accounts(transaction_id,account_id,amount,direction) VALUES ($1,$2,$3,$4)', [id,accountId,value,direction]);
    return id;
  };
  split = await movement('income',100,child,[[bank,60],[cash,15],[cash,25]]);
  await movement('expense',-30,child,[[bank,10],[cash,20]]);
  await movement('income',50,parent,[[cash,50]]);
  await movement('income',20,null,[]);
  await movement('transfer',25,null,[[bank,25,'out'],[cash,25,'in']]);
  await movement('income',900,foreignCategory,[[foreignAccount,900]],other);
  for (const name of ['one','two']) await query('INSERT INTO attachments(transaction_id,file_name,path,original_name,storage_path) VALUES ($1,$2,$2,$2,$2)', [split,name]);
  server = app.listen(0); await new Promise((resolve) => server.once('listening',resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await close(); });
test('general totals count each cash flow once and exclude transfers and foreign companies', async () => {
  const result = await request('run',spec()); assert.equal(result.status,200);
  assert.deepEqual(values(result.data.totals),[17000,3000,14000,4]);
  assert.deepEqual(values(result.data.rows[0]),[17000,3000,14000,4]);
  assert.equal(Number(result.data.totals.avg_abs_cents),5000);
});
test('account allocations reconcile amounts and merge multiple legs on the same account', async () => {
  const result = await request('run',spec({ groupBy:['account'] })); assert.equal(result.status,200);
  const rows = result.data.rows;
  assert.deepEqual(values(rows.find((r) => r.account_id === bank)),[6000,1000,5000,2]);
  assert.deepEqual(values(rows.find((r) => r.account_id === cash)),[9000,2000,7000,3]);
  assert.deepEqual(values(rows.find((r) => r.account_id == null)),[2000,0,2000,1]);
  assert.equal(rows.reduce((sum,r) => sum+Number(r.net_sum_cents),0),Number(result.data.totals.net_sum_cents));
  assert.equal(result.data.amount_basis,'account_allocations');
  assert.deepEqual(result.data.reconciliation,{income_sum_cents:'0',expense_sum_cents:'0',net_sum_cents:'0'});
});
test('filtering the second account uses its assigned share without missing the movement', async () => {
  for (const groupBy of [[],['account'],['category']]) {
    const result = await request('run',spec({ groupBy, filters:{accountId:cash} })); assert.equal(result.status,200);
    assert.deepEqual(values(result.data.totals),[9000,2000,7000,3]);
    assert.equal(result.data.rows.reduce((sum,r) => sum+Number(r.net_sum_cents),0),7000);
  }
  assert.equal((await request('run',spec({filters:{accountId:foreignAccount}}))).data.totals.count,0);
});
test('category descendants and attachment existence do not multiply rows', async () => {
  assert.deepEqual(values((await request('run',spec({filters:{categoryId:parent,includeCategoryChildren:true}}))).data.totals),[15000,3000,12000,3]);
  assert.deepEqual(values((await request('run',spec({filters:{categoryId:parent,includeCategoryChildren:false}}))).data.totals),[5000,0,5000,1]);
  assert.deepEqual(values((await request('run',spec({filters:{hasAttachments:true,accountId:cash}}))).data.totals),[4000,0,4000,1]);
});
test('CSV and rows use the same deterministic ordering; truncation is explicit', async () => {
  const input = spec({groupBy:['account'],sort:{by:'account',dir:'asc'},limit:2});
  const result = await request('run',input); assert.equal(result.data.truncated,true); assert.equal(result.data.rows.length,2);
  assert.equal(result.data.reconciliation,null);
  assert.deepEqual(values(result.data.totals),[17000,3000,14000,4]);
  const csv = await request('export.csv',input); assert.equal(csv.status,200);
  const lines = csv.data.trim().split('\n'); const headers = lines.shift().split(';');
  assert.deepEqual(lines.map((line) => line.split(';')),result.data.rows.map((row) => headers.map((key) => String(row[key] ?? ''))));
  assert.equal((await request('run',spec({groupBy:['account'],limit:3}))).data.truncated,false);
});
test('invalid filters and impossible dates are rejected instead of broadening the report', async () => {
  for (const input of [spec({dateFrom:'2026-02-30'}),spec({dateTo:'2025-02-29'}),spec({filters:{accountId:'bad'}}),spec({filters:{categoryId:0}}),spec({filters:{jobId:-1}}),spec({filters:{contactId:true}}),spec({filters:{type:'wrong'}}),spec({groupBy:['month','year']})]) assert.equal((await request('run',input)).status,400);
});
test('cyclic category data terminates and does not duplicate included transactions', async () => {
  await query('UPDATE categories SET parent_id=$1 WHERE id=$2',[child,parent]);
  try { assert.deepEqual(values((await request('run',spec({filters:{categoryId:parent}}))).data.totals),[15000,3000,12000,3]); }
  finally { await query('UPDATE categories SET parent_id=NULL WHERE id=$1',[parent]); }
});
test('foreign labels are not disclosed through malformed historical references', async () => {
  await query('UPDATE transactions SET category_id=$1 WHERE id=$2',[foreignCategory,split]);
  try { assert.equal(JSON.stringify((await request('run',spec({groupBy:['category']}))).data).includes('Private foreign category'),false); }
  finally { await query('UPDATE transactions SET category_id=$1 WHERE id=$2',[child,split]); }
});

test('inconsistent historical allocations produce an explicit reconciliation difference', async () => {
  await query('UPDATE transactions SET amount_total=110 WHERE id=$1',[split]);
  try {
    const result = await request('run',spec({groupBy:['account']}));
    assert.equal(result.data.reconciliation.income_sum_cents,'-1000');
    assert.equal(result.data.reconciliation.net_sum_cents,'-1000');
  } finally { await query('UPDATE transactions SET amount_total=100 WHERE id=$1',[split]); }
});

test('drilldown returns precisely the movements and monetary shares behind each row', async () => {
  await query("UPDATE transactions SET date='2026-09-25' WHERE company_id=$1 AND amount_total=20",[company]);
  const inputs = [
    ...['day','week','month','quarter','year','category','account','contact','property','job','type','recurring'].map((dimension) => spec({groupBy:[dimension]})),
    spec({groupBy:['week','account']}), spec({groupBy:['month','category'],filters:{categoryId:parent,includeCategoryChildren:true}}),
    spec({groupBy:['contact'],filters:{categoryId:parent,includeCategoryChildren:true,hasAttachments:false}}),
    spec({groupBy:['category'],filters:{accountId:cash,text:'Golden',hasAttachments:true}}),
    spec({groupBy:['account'],filters:{type:'transfer'}}),
  ];
  for (const input of inputs) {
    const report = await request('run',input); assert.equal(report.status,200,JSON.stringify(input));
    for (const row of report.data.rows) {
      const params = reportDrilldownParams(report.data.spec,row);
      const result = await fetch(`${baseUrl}/api/transactions?${params}`,{headers:{Authorization:`Bearer ${token}`,'X-Company-Id':String(company)}});
      assert.equal(result.status,200,params.toString());
      const movements = await result.json();
      assert.equal(movements.length,Number(row.count),params.toString());
      const accountId = params.get('account_id');
      const cents = (movement) => Math.round((accountId ? movement.accounts.filter((entry) => Number(entry.account_id) === Number(accountId)).reduce((sum,entry) => sum+Number(entry.amount),0) : Number(movement.amount_total))*100);
      const income = movements.filter((m) => m.type === 'income').reduce((sum,m) => sum+cents(m),0);
      const expense = movements.filter((m) => m.type === 'expense').reduce((sum,m) => sum+Math.abs(cents(m)),0);
      assert.deepEqual([income,expense,income-expense],[Number(row.income_sum_cents),Number(row.expense_sum_cents),Number(row.net_sum_cents)],params.toString());
    }
  }
});

test('description-only drilldown does not broaden matching to category names', async () => {
  const report = await request('run',spec({filters:{text:'Parent'}}));
  assert.equal(report.data.totals.count,0);
  const params = reportDrilldownParams(report.data.spec,report.data.rows[0]);
  const result = await fetch(`${baseUrl}/api/transactions?${params}`,{headers:{Authorization:`Bearer ${token}`,'X-Company-Id':String(company)}});
  assert.deepEqual(await result.json(),[]);
});

test('budget report uses real lifetime budgets, includes empty jobs and preserves unknown budgets',async()=>{
 const ids=[];
 try {
  for(const [name,revenue,cost] of [['Budget',12000,2000],['Empty',0,0],['Unknown',null,null]]) ids.push((await query('INSERT INTO jobs(company_id,name,title,expected_revenue_cents,expected_cost_cents) VALUES($1,$2,$2,$3,$4) RETURNING id',[company,name,revenue,cost])).rows[0].id);
  await query('UPDATE transactions SET job_id=$1 WHERE id=$2',[ids[0],split]);
  const input=spec({reportKind:'budget',dateFrom:'2020-01-01',dateTo:'2020-01-02',groupBy:['job']});
  const report=await request('run',input);assert.equal(report.status,200);
  const budget=report.data.rows.find(r=>r.job_id===ids[0]);
  assert.equal(budget.income_sum_cents,'10000');assert.equal(budget.revenue_variance_cents,'-2000');assert.equal(budget.cost_variance_cents,'-2000');
  assert.equal(report.data.rows.find(r=>r.job_id===ids[1]).count,0);
  assert.equal(report.data.rows.find(r=>r.job_id===ids[2]).expected_net_cents,null);
  assert.equal((await request('run',{...input,filters:{accountId:cash}})).status,400);
  const params=reportDrilldownParams(report.data.spec,budget);assert.equal(params.has('date_from'),false);
  const csv=await request('export.csv',input);assert.equal(csv.status,200);assert.ok(csv.data.includes('revenue_variance_cents'));assert.ok(csv.data.includes('-2000'));
 }finally{await query('UPDATE transactions SET job_id=NULL WHERE id=$1',[split]);await query('DELETE FROM jobs WHERE id=ANY($1::int[])',[ids]);}
});
test('YoY and MoM compare actual matching periods and retain account allocations',async()=>{
 const ids=[];
 try{
  for(const [date,type,amount] of [['2025-09-10','income',50],['2026-08-10','expense',10]]) {
   const id=(await query('INSERT INTO transactions(company_id,date,type,amount_total,description) VALUES($1,$2,$3,$4,$5) RETURNING id',[company,date,type,amount,'Previous'])).rows[0].id;ids.push(id);
   await query("INSERT INTO transaction_accounts(transaction_id,account_id,direction,amount) VALUES($1,$2,$3,$4)",[id,cash,type==='expense'?'out':'in',amount]);
  }
  const report=await request('run',spec({reportKind:'yoy',groupBy:['month'],filters:{type:'all',accountId:cash}}));assert.equal(report.status,200);
  assert.deepEqual([report.data.rows[0].current_cents,report.data.rows[0].previous_cents,report.data.rows[0].delta_cents],['7000','5000','2000']);
  const previous=reportDrilldownParams(report.data.spec,report.data.rows[0],true);assert.equal(previous.get('date_from'),'2025-09-01');assert.equal(previous.get('account_id'),String(cash));
  const mom=await request('run',spec({reportKind:'mom',groupBy:['month'],filters:{type:'expense',accountId:cash}}));assert.equal(mom.status,200);
  assert.deepEqual([mom.data.rows[0].current_cents,mom.data.rows[0].previous_cents,mom.data.rows[0].change_pct],['2000','1000','100.00']);
  const zero=await request('run',spec({reportKind:'yoy',dateFrom:'2022-01-01',dateTo:'2022-02-28',groupBy:['month']}));assert.equal(zero.data.rows.length,2);assert.equal(zero.data.rows[0].change_pct,null);
  const limited=await request('run',spec({reportKind:'yoy',dateFrom:'2022-01-01',dateTo:'2022-02-28',groupBy:['month'],limit:1}));assert.equal(limited.data.truncated,true);
 }finally{await query('DELETE FROM transactions WHERE id=ANY($1::int[])',[ids]);}
});
test('quality checks selected links without duplicates and treats cross-company links as invalid',async()=>{
 const input=spec({reportKind:'quality',groupBy:[],qualityDimensions:['account','category','contact','job','property']});
 const report=await request('run',input);assert.equal(report.status,200);
 assert.equal(report.data.rows.length,5);assert.equal(report.data.rows[0].total_count,4);
 assert.equal(report.data.rows.find(r=>r.dimension==='account').missing_count,1);
 assert.equal(report.data.rows.find(r=>r.dimension==='category').missing_count,1);
 assert.equal(report.data.rows.find(r=>r.dimension==='contact').missing_count,4);
 try{
  await query('UPDATE transactions SET category_id=$1 WHERE id=$2',[foreignCategory,split]);
  const altered=await request('run',input);assert.equal(altered.data.rows.find(r=>r.dimension==='category').missing_count,2);
 }finally{await query('UPDATE transactions SET category_id=$1 WHERE id=$2',[child,split]);}
 assert.equal((await request('run',{...input,qualityDimensions:[]})).status,400);
 const foreign=await request('run',{...input,filters:{accountId:foreignAccount}});assert.ok(foreign.data.rows.every(r=>r.total_count===0));
});
test('saved comparison specs retain their report kind and export matches calculated row data',async()=>{
 const input=spec({reportKind:'yoy',groupBy:['month']});
 const headers={Authorization:`Bearer ${token}`,'X-Company-Id':String(company),'Content-Type':'application/json'};
 const saved=await fetch(`${baseUrl}/api/reports/advanced/saved`,{method:'POST',headers,body:JSON.stringify({name:'YoY persisted',spec_json:input,is_shared:false})});
 assert.equal(saved.status,201);
 const list=await(await fetch(`${baseUrl}/api/reports/advanced/saved`,{headers})).json();
 const savedSpec=list.find(r=>r.name==='YoY persisted').spec_json;assert.equal(savedSpec.reportKind,'yoy');
 const report=await request('run',savedSpec);const exported=await request('export.csv',savedSpec);
 assert.equal(exported.status,200);
 const lines=exported.data.trim().split('\n');const columns=lines[0].split(';');
 for(const [i,row] of report.data.rows.entries()) assert.deepEqual(lines[i+1].split(';'),columns.map(k=>row[k]==null?'':String(row[k])));
});
