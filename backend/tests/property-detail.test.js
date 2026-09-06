import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';
let server, baseUrl, token, companyId, propertyId, foreignId;
const request = async (suffix) => {
  const response = await fetch(`${baseUrl}/api/properties/${suffix}`, { headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': String(companyId) } });
  return { status: response.status, body: await response.json() };
};
test.before(async () => {
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex'); await resetDb();
  companyId = (await query("INSERT INTO companies(name) VALUES ('Property test') RETURNING id")).rows[0].id;
  const other = (await query("INSERT INTO companies(name) VALUES ('Other') RETURNING id")).rows[0].id;
  const user = (await query("INSERT INTO users(company_id,email,password_hash,role) VALUES ($1,'property@test.local','unused','viewer') RETURNING id", [companyId])).rows[0];
  token = jwt.sign({ user_id: user.id, default_company_id: companyId }, process.env.JWT_SECRET);
  propertyId = (await query("INSERT INTO properties(company_id,name,address,is_active) VALUES ($1,'Casa','Via Roma 1',false) RETURNING id", [companyId])).rows[0].id;
  foreignId = (await query("INSERT INTO properties(company_id,name) VALUES ($1,'Private') RETURNING id", [other])).rows[0].id;
  await query("INSERT INTO transactions(company_id,property_id,date,type,amount_total) SELECT $1,$2,'2026-09-01','income',10.01 FROM generate_series(1,25)", [companyId, propertyId]);
  await query(`INSERT INTO transactions(company_id,property_id,date,type,amount_total) VALUES
    ($1,$2,'2026-09-30','expense',-50.05),($1,$2,'2026-09-10','transfer',999),($1,$2,'2026-08-31','income',500)`, [companyId, propertyId]);
  await query("INSERT INTO transactions(company_id,property_id,date,type,amount_total) VALUES ($1,$2,'2026-09-01','income',9999)", [other, propertyId]);
  server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await close(); });
test('viewer sees inactive property with exact totals over all pages, inclusive dates and no transfers or foreign transactions', async () => {
  const response = await request(`${propertyId}?date_from=2026-09-01&date_to=2026-09-30`);
  assert.equal(response.status, 200); assert.equal(response.body.address, 'Via Roma 1');
  assert.equal(Number(response.body.income), 250.25); assert.equal(Number(response.body.expense), 50.05);
  assert.equal(Number(response.body.net), 200.20); assert.equal(response.body.movement_count, 27);
});
test('foreign and missing properties are indistinguishable', async () => {
  assert.equal((await request(foreignId)).status, 404); assert.equal((await request(2147483647)).status, 404);
});
test('empty periods return zero; invalid dates and identifiers are rejected', async () => {
  const empty = await request(`${propertyId}?date_from=2030-01-01`);
  assert.equal(empty.body.movement_count, 0); assert.equal(Number(empty.body.net), 0);
  for (const suffix of ['abc', '0', `${propertyId}?date_from=2026-02-30`, `${propertyId}?date_from=2026-10-01&date_to=2026-01-01`]) assert.equal((await request(suffix)).status, 400);
});
