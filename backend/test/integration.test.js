import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import app from '../src/app.js';

const { Client } = pg;
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

let server;
let baseUrl;

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
    return { status: res.status, body: null };
  }

  return { status: res.status, body: await res.json() };
};

const login = async () => {
  const response = await jsonRequest(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'dev@flussio.local', password: 'flussio123' }),
  });
  assert.equal(response.status, 200);
  return response.body.token;
};

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
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
    body: JSON.stringify({ email: 'dev@flussio.local', password: 'flussio123' }),
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
