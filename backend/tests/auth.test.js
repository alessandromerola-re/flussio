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

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  await resetDb();

  const passwordHash = await bcrypt.hash('flussio123', 10);
  const company = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Test Co']);
  await query('INSERT INTO users (company_id, email, password_hash) VALUES ($1, $2, $3)', [
    company.rows[0].id,
    'dev@flussio.local',
    passwordHash,
  ]);

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

test('POST /api/auth/login returns token for bcrypt user', async () => {
  const response = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'dev@flussio.local',
      password: 'flussio123',
    }),
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
});
