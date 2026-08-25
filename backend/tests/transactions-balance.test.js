import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';

let server;
let baseUrl;

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return { status: response.status, body: null };
  }

  return { status: response.status, body: await response.json() };
};

const getToken = async (email, password) => {
  const response = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.body.token;
};

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  await resetDb();

  const passwordHash = await bcrypt.hash('flussio123', 10);
  const company = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Balance Co']);
  const companyId = company.rows[0].id;

  await query('INSERT INTO users (company_id, email, password_hash) VALUES ($1, $2, $3)', [
    companyId,
    'dev@flussio.local',
    passwordHash,
  ]);

  await query(
    `
    INSERT INTO accounts (company_id, name, type, opening_balance, balance)
    VALUES ($1, 'Cassa', 'cash', 1000, 1000), ($1, 'Banca', 'bank', 2000, 2000)
    `,
    [companyId]
  );

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await close();
});

test('create/delete transaction updates and reverts account balance', async () => {
  const token = await getToken('dev@flussio.local', 'flussio123');

  const beforeAccounts = await requestJson('/api/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(beforeAccounts.status, 200);
  const cashBefore = Number(beforeAccounts.body.find((account) => account.name === 'Cassa').balance);

  const createResponse = await requestJson('/api/transactions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      date: '2026-02-15',
      type: 'income',
      amount_total: 250,
      description: 'Incasso test',
      accounts: [{ account_id: beforeAccounts.body.find((a) => a.name === 'Cassa').id, direction: 'in', amount: 250 }],
    }),
  });
  assert.equal(createResponse.status, 201);

  const afterCreateAccounts = await requestJson('/api/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cashAfterCreate = Number(afterCreateAccounts.body.find((account) => account.name === 'Cassa').balance);
  assert.equal(cashAfterCreate, cashBefore + 250);

  const deleteResponse = await requestJson(`/api/transactions/${createResponse.body.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteResponse.status, 204);

  const afterDeleteAccounts = await requestJson('/api/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cashAfterDelete = Number(afterDeleteAccounts.body.find((account) => account.name === 'Cassa').balance);
  assert.equal(cashAfterDelete, cashBefore);
});

test('account reconciliation reports and repairs stored balance drift', async () => {
  const token = await getToken('dev@flussio.local', 'flussio123');
  const accounts = await requestJson('/api/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cash = accounts.body.find((account) => account.name === 'Cassa');
  await query('UPDATE accounts SET balance = balance + 12.34 WHERE id = $1', [cash.id]);

  const beforeRepair = await requestJson('/api/accounts/reconciliation', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(beforeRepair.status, 200);
  assert.equal(beforeRepair.body.is_reconciled, false);
  assert.equal(Number(beforeRepair.body.accounts.find((account) => account.id === cash.id).difference), 12.34);

  const repair = await requestJson('/api/accounts/reconciliation/apply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(repair.status, 200);
  assert.equal(repair.body.is_reconciled, true);
  assert.equal(Number(repair.body.accounts.find((account) => account.id === cash.id).difference), 0);
});

test('account with movement history cannot be deleted', async () => {
  const token = await getToken('dev@flussio.local', 'flussio123');
  const accounts = await requestJson('/api/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cash = accounts.body.find((account) => account.name === 'Cassa');

  const createResponse = await requestJson('/api/transactions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      date: '2026-02-16',
      type: 'income',
      amount_total: 10,
      description: 'Movimento storico',
      accounts: [{ account_id: cash.id, direction: 'in', amount: 10 }],
    }),
  });
  assert.equal(createResponse.status, 201);

  const deleteResponse = await requestJson(`/api/accounts/${cash.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteResponse.status, 409);
  assert.equal(deleteResponse.body.error_code, 'ACCOUNT_HAS_MOVEMENTS');
});
