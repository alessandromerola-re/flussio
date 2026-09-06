import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { query, resetDb, close } from './_db.js';
let server, baseUrl, token, companyId, templateId, foreignId, movementId;
const request = async (path) => {
  const response = await fetch(`${baseUrl}/api/${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': String(companyId) } });
  return { status: response.status, data: await response.json() };
};
test.before(async () => {
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex'); process.env.RECURRING_GENERATOR_ENABLED = 'false';
  await resetDb();
  companyId = (await query("INSERT INTO companies(name) VALUES ('History') RETURNING id")).rows[0].id;
  const other = (await query("INSERT INTO companies(name) VALUES ('Other') RETURNING id")).rows[0].id;
  const user = (await query("INSERT INTO users(company_id,email,password_hash,role) VALUES ($1,'history@test.local','unused','viewer') RETURNING id", [companyId])).rows[0];
  token = jwt.sign({ user_id: user.id, default_company_id: companyId }, process.env.JWT_SECRET);
  const create = async (company) => (await query("INSERT INTO recurring_templates(company_id,title,frequency,next_run_at,amount,movement_type) VALUES ($1,'Rent','monthly','2026-09-01',10,'income') RETURNING id", [company])).rows[0].id;
  templateId = await create(companyId); foreignId = await create(other);
  movementId = (await query("INSERT INTO transactions(company_id,date,type,amount_total,recurring_template_id) VALUES ($1,'2026-09-01','income',10,$2) RETURNING id", [companyId, templateId])).rows[0].id;
  await query("INSERT INTO recurring_runs(template_id,cycle_key,run_at,run_type,generated_movement_id) SELECT $1,n::text,'2026-09-01','auto',$2 FROM generate_series(1,21) n", [templateId, movementId]);
  await query("INSERT INTO transactions(company_id,date,type,amount_total,recurring_template_id) VALUES ($1,'2026-09-01','income',999,$2)", [other, templateId]);
  server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await close(); });
test('history is readable with generator disabled and paginates without duplication', async () => {
  assert.equal((await request('recurring-templates/status')).data.generator_enabled, false);
  const first = await request(`recurring-templates/${templateId}/runs`);
  const second = await request(`recurring-templates/${templateId}/runs?offset=20`);
  assert.equal(first.status, 200); assert.equal(first.data.rows.length, 20); assert.equal(first.data.has_more, true);
  assert.equal(second.data.rows.length, 1); assert.equal(second.data.has_more, false);
  assert.equal(new Set([...first.data.rows,...second.data.rows].map((row) => row.id)).size, 21);
  assert.equal((await request(`recurring-templates/${foreignId}/runs`)).status, 404);
  assert.equal((await request(`recurring-templates/${templateId}/runs?offset=-1`)).status, 400);
});
test('movement deep links honor the template, movement and company filters', async () => {
  const byTemplate = await request(`transactions?recurring_template_id=${templateId}`);
  assert.equal(byTemplate.data.length, 1); assert.equal(byTemplate.data[0].id, movementId);
  assert.equal((await request(`transactions?transaction_id=${movementId}`)).data.length, 1);
  assert.equal((await request(`transactions?recurring_template_id=${foreignId}`)).data.length, 0);
  assert.equal((await request('transactions?transaction_id=bad')).status, 400);
});
