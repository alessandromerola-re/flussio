import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import app from '../src/app.js';

const { Client } = pg;
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

let server;
let baseUrl;
let testAdminPassword;

const getClient = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
};

const resetDb = async () => {
  const schemaSql = await fs.readFile(path.join(rootDir, 'database/init/001_schema.sql'), 'utf8');
  const seedSql = await fs.readFile(path.join(rootDir, 'database/init/002_seed_dev.sql'), 'utf8');

  const client = await getClient();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await client.query(schemaSql);
    await client.query(seedSql);
    const passwordHash = await bcrypt.hash(testAdminPassword, 10);
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [passwordHash, 'dev@flussio.local']
    );
  } finally {
    await client.end();
  }
};

const jsonRequest = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 204) {
    return { status: res.status, body: null, headers: res.headers };
  }

  return { status: res.status, body: await res.json(), headers: res.headers };
};

const login = async () => {
  const response = await jsonRequest(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'dev@flussio.local', password: testAdminPassword }),
  });
  assert.equal(response.status, 200);
  return response.body.token;
};

test.before(async () => {
  testAdminPassword = crypto.randomBytes(32).toString('base64url');
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  await resetDb();

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('login ok', async () => {
  const response = await jsonRequest(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'dev@flussio.local', password: testAdminPassword }),
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
});

test('properties CRUD including PUT response', async () => {
  const token = await login();

  const createResponse = await jsonRequest(`${baseUrl}/api/properties`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Nuovo immobile', notes: 'test', contact_id: 1, is_active: true }),
  });
  assert.equal(createResponse.status, 201);

  const updateResponse = await jsonRequest(`${baseUrl}/api/properties/${createResponse.body.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Immobile aggiornato', notes: 'ok', contact_id: 2, is_active: false }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.name, 'Immobile aggiornato');

  const deleteResponse = await jsonRequest(`${baseUrl}/api/properties/${createResponse.body.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteResponse.status, 204);
});

test('create and delete transaction updates account balances', async () => {
  const token = await login();

  const beforeAccounts = await jsonRequest(`${baseUrl}/api/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cashBefore = Number(beforeAccounts.body.find((item) => item.name === 'Cassa').balance);

  const createTx = await jsonRequest(`${baseUrl}/api/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      date: '2026-02-15',
      type: 'income',
      amount_total: 100,
      description: 'Test income',
      category_id: 1,
      contact_id: 1,
      property_id: 1,
      accounts: [{ account_id: 1, direction: 'in', amount: 100 }],
    }),
  });
  assert.equal(createTx.status, 201);

  const afterCreateAccounts = await jsonRequest(`${baseUrl}/api/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cashAfterCreate = Number(afterCreateAccounts.body.find((item) => item.name === 'Cassa').balance);
  assert.equal(cashAfterCreate, cashBefore + 100);

  const deleteTx = await jsonRequest(`${baseUrl}/api/transactions/${createTx.body.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteTx.status, 204);

  const afterDeleteAccounts = await jsonRequest(`${baseUrl}/api/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cashAfterDelete = Number(afterDeleteAccounts.body.find((item) => item.name === 'Cassa').balance);
  assert.equal(cashAfterDelete, cashBefore);
});

test('transaction list supports related search, filters, sorting and total count', async () => {
  const token = await login();
  const headers = { Authorization: `Bearer ${token}` };

  const propertyPage = await jsonRequest(
    `${baseUrl}/api/transactions?property_id=1&sort_by=amount&sort_dir=asc&limit=1`,
    { headers }
  );
  assert.equal(propertyPage.status, 200);
  assert.equal(propertyPage.body.length, 1);
  assert.equal(propertyPage.body[0].property_name, 'Immobile Centro');
  assert.equal(Math.abs(Number(propertyPage.body[0].amount_total)), 450);
  assert.equal(propertyPage.headers.get('x-total-count'), '2');
  assert.equal(propertyPage.headers.get('x-has-more'), 'true');

  const relatedSearch = await jsonRequest(
    `${baseUrl}/api/transactions?q=${encodeURIComponent('Cliente Alpha')}`,
    { headers }
  );
  assert.equal(relatedSearch.status, 200);
  assert.equal(relatedSearch.body.length, 1);
  assert.equal(relatedSearch.body[0].description, 'Fattura vendita');

  const withoutAttachments = await jsonRequest(
    `${baseUrl}/api/transactions?has_attachments=0&is_recurring=0`,
    { headers }
  );
  assert.equal(withoutAttachments.status, 200);
  assert.equal(withoutAttachments.headers.get('x-total-count'), '3');

  const invalidSort = await jsonRequest(`${baseUrl}/api/transactions?sort_by=created_at`, { headers });
  assert.equal(invalidSort.status, 400);
});

test('movement export and import preserve the property association', async () => {
  const token = await login();
  const headers = { Authorization: `Bearer ${token}` };

  const exportResponse = await fetch(
    `${baseUrl}/api/transactions/export?q=${encodeURIComponent('Fattura vendita')}`,
    { headers }
  );
  assert.equal(exportResponse.status, 200);
  const csv = await exportResponse.text();
  assert.match(csv, /;property;/);
  assert.match(csv, /Immobile Centro/);

  const formData = new FormData();
  formData.append('file', new Blob([csv], { type: 'text/csv' }), 'movements-roundtrip.csv');
  const importResponse = await fetch(`${baseUrl}/api/settings/movements/import-csv`, {
    method: 'POST',
    headers,
    body: formData,
  });
  assert.equal(importResponse.status, 201);
  const importResult = await importResponse.json();
  assert.equal(importResult.imported, 1);
  assert.equal(importResult.skipped, 0);

  const importedMovements = await jsonRequest(
    `${baseUrl}/api/transactions?q=${encodeURIComponent('Fattura vendita')}&property_id=1`,
    { headers }
  );
  assert.equal(importedMovements.status, 200);
  assert.equal(importedMovements.headers.get('x-total-count'), '2');
  assert.ok(importedMovements.body.every((movement) => movement.property_name === 'Immobile Centro'));
});
