import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';

let server;
let baseUrl;
const testPassword = crypto.randomUUID();

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return { status: response.status, body: null, headers: response.headers };
  }

  return { status: response.status, body: await response.json(), headers: response.headers };
};

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.AUTH_COOKIE_SECURE = 'false';
  await resetDb();

  const passwordHash = await bcrypt.hash(testPassword, 10);
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
      password: testPassword,
    }),
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.match(response.headers.get('set-cookie'), /flussio_refresh=.*HttpOnly/i);
});

test('remembered login rotates a persistent refresh session and logout revokes it', async () => {
  const loginResponse = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'dev@flussio.local',
      password: testPassword,
      remember: true,
    }),
  });

  assert.equal(loginResponse.status, 200);
  const accessPayload = jwt.decode(loginResponse.body.token);
  assert.ok(accessPayload.exp - accessPayload.iat <= 15 * 60);

  const loginSetCookie = loginResponse.headers.get('set-cookie');
  assert.match(loginSetCookie, /HttpOnly/i);
  assert.match(loginSetCookie, /SameSite=Lax/i);
  assert.match(loginSetCookie, /Max-Age=2592000/i);
  const firstCookie = loginSetCookie.split(';')[0];

  const refreshResponse = await requestJson('/api/auth/refresh', {
    method: 'POST',
    headers: { Cookie: firstCookie },
  });
  assert.equal(refreshResponse.status, 200);
  assert.ok(refreshResponse.body.token);
  assert.notEqual(refreshResponse.body.token, loginResponse.body.token);

  const secondSetCookie = refreshResponse.headers.get('set-cookie');
  const secondCookie = secondSetCookie.split(';')[0];
  assert.notEqual(secondCookie, firstCookie);
  assert.match(secondSetCookie, /Max-Age=2592000/i);

  const sessionsAfterRotation = await query(
    `SELECT COUNT(*) FILTER (WHERE revoked_at IS NULL) AS active,
            COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked
     FROM auth_sessions`
  );
  assert.equal(Number(sessionsAfterRotation.rows[0].active), 2);
  assert.equal(Number(sessionsAfterRotation.rows[0].revoked), 1);

  const reusedResponse = await requestJson('/api/auth/refresh', {
    method: 'POST',
    headers: { Cookie: firstCookie },
  });
  assert.equal(reusedResponse.status, 401);

  const logoutResponse = await requestJson('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: secondCookie },
  });
  assert.equal(logoutResponse.status, 204);
  assert.match(logoutResponse.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);

  const afterLogoutResponse = await requestJson('/api/auth/refresh', {
    method: 'POST',
    headers: { Cookie: secondCookie },
  });
  assert.equal(afterLogoutResponse.status, 401);
});

test('login without remember uses a browser-session cookie', async () => {
  const response = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'dev@flussio.local',
      password: testPassword,
      remember: false,
    }),
  });

  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.doesNotMatch(setCookie, /Max-Age=/i);
});
