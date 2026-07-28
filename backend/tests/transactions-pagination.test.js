import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';

let server;
let baseUrl;
let token;
let companyId;

const requestPage = async (queryString) => {
  const response = await fetch(`${baseUrl}/api/transactions?${queryString}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Company-Id': String(companyId) },
  });
  return {
    status: response.status,
    body: await response.json(),
    hasMore: response.headers.get('x-has-more'),
  };
};

const seedTransactions = async (count, { type = 'income', prefix = 'movement' } = {}) => {
  await query('TRUNCATE transactions RESTART IDENTITY CASCADE');
  if (!count) return;
  await query(
    `INSERT INTO transactions (company_id, date, type, amount_total, description)
     SELECT $1, DATE '2026-01-01' + (n - 1), $2, n, $3 || '-' || n
     FROM generate_series(1, $4) AS n`,
    [companyId, type, prefix, count]
  );
};

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  await resetDb();
  const company = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Pagination Co']);
  companyId = company.rows[0].id;
  const user = await query(
    'INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [companyId, 'pagination@flussio.local', 'unused', 'admin']
  );
  token = jwt.sign({ user_id: user.rows[0].id, default_company_id: companyId }, process.env.JWT_SECRET);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await close();
});

for (const { count, limit, expectedLength, expectedMore } of [
  { count: 30, limit: 30, expectedLength: 30, expectedMore: 'false' },
  { count: 31, limit: 30, expectedLength: 30, expectedMore: 'true' },
  { count: 200, limit: 200, expectedLength: 200, expectedMore: 'false' },
  { count: 201, limit: 200, expectedLength: 200, expectedMore: 'true' },
]) {
  test(`${count} results with limit ${limit} returns a bounded array and correct X-Has-More`, async () => {
    await seedTransactions(count);
    const response = await requestPage(`limit=${limit}`);
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));
    assert.equal(response.body.length, expectedLength);
    assert.equal(response.hasMore, expectedMore);
  });
}

test('60 results cross page boundaries without returning the sentinel row', async () => {
  await seedTransactions(60);
  const first = await requestPage('limit=30&offset=0');
  const second = await requestPage('limit=30&offset=30');
  assert.equal(first.body.length, 30);
  assert.equal(first.hasMore, 'true');
  assert.equal(second.body.length, 30);
  assert.equal(second.hasMore, 'false');
  assert.equal(new Set([...first.body, ...second.body].map(({ id }) => id)).size, 60);
});

test('filters and ordering are applied before has-more calculation', async () => {
  await seedTransactions(31, { type: 'income', prefix: 'matching' });
  await query(
    `INSERT INTO transactions (company_id, date, type, amount_total, description)
     VALUES ($1, '2030-01-01', 'expense', 1, 'not-matching')`,
    [companyId]
  );
  const response = await requestPage('limit=30&type=income&q=matching');
  assert.equal(response.hasMore, 'true');
  assert.equal(response.body.length, 30);
  assert.ok(response.body.every(({ type, description }) => type === 'income' && description.startsWith('matching-')));
  assert.ok(response.body.every((row, index, rows) => index === 0 || new Date(rows[index - 1].date) >= new Date(row.date)));
});

test('invalid and excessive limits are rejected', async () => {
  for (const limit of ['201', '-1', 'invalid', '1.5']) {
    const response = await requestPage(`limit=${limit}`);
    assert.equal(response.status, 400);
    assert.equal(response.body.error_code, 'VALIDATION_MISSING_FIELDS');
  }
});
