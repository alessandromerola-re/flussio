import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { close, query, resetDb } from './_db.js';

let server;
let baseUrl;
let companyAId;
let companyBId;
let targetUserId;
let adminToken;
let superAdminToken;
let targetToken;

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
};

const login = async (email) => {
  const response = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'flussio123' }),
  });
  assert.equal(response.status, 200);
  return response.body.token;
};

const companyHeaders = (token, companyId) => ({
  Authorization: `Bearer ${token}`,
  'X-Company-Id': String(companyId),
});

test.before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  await resetDb();

  const passwordHash = await bcrypt.hash('flussio123', 10);
  const companies = await query(
    `INSERT INTO companies (name)
     VALUES ('Azienda A'), ('Azienda B')
     RETURNING id
    `
  );
  [companyAId, companyBId] = companies.rows.map((row) => row.id);

  const superAdmin = await query(
    `INSERT INTO users (company_id, email, password_hash, is_super_admin)
     VALUES ($1, 'super@flussio.local', $2, true)
     RETURNING id`,
    [companyAId, passwordHash]
  );
  const companyAdmin = await query(
    `INSERT INTO users (company_id, email, password_hash)
     VALUES ($1, 'admin-a@flussio.local', $2)
     RETURNING id`,
    [companyAId, passwordHash]
  );
  const targetUser = await query(
    `INSERT INTO users (company_id, email, password_hash)
     VALUES ($1, 'target@flussio.local', $2)
     RETURNING id`,
    [companyAId, passwordHash]
  );
  targetUserId = targetUser.rows[0].id;

  await query(
    `INSERT INTO user_companies (user_id, company_id, role, is_active)
     VALUES
       ($1, $3, 'admin', true),
       ($2, $3, 'editor', true),
       ($2, $4, 'admin', true)`,
    [companyAdmin.rows[0].id, targetUserId, companyAId, companyBId]
  );

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminToken = await login('admin-a@flussio.local');
  superAdminToken = await login('super@flussio.local');
  targetToken = await login('target@flussio.local');
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await close();
});

test('company admin sees only the membership of the active company', async () => {
  const response = await requestJson(`/api/users/${targetUserId}`, {
    headers: companyHeaders(adminToken, companyAId),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.memberships.map((membership) => membership.company_id), [companyAId]);
});

test('company admin membership payload updates role without touching other companies', async () => {
  const response = await requestJson(`/api/users/${targetUserId}`, {
    method: 'PUT',
    headers: companyHeaders(adminToken, companyAId),
    body: JSON.stringify({
      memberships: [{ company_id: companyAId, role: 'operatore', is_active: false }],
    }),
  });
  assert.equal(response.status, 200);

  const memberships = await query(
    'SELECT company_id, role, is_active FROM user_companies WHERE user_id = $1 ORDER BY company_id',
    [targetUserId]
  );
  assert.deepEqual(memberships.rows, [
    { company_id: companyAId, role: 'operatore', is_active: false },
    { company_id: companyBId, role: 'admin', is_active: true },
  ]);
});

test('inactive membership cannot use the legacy primary-company fallback', async () => {
  const response = await requestJson('/api/accounts', {
    headers: companyHeaders(targetToken, companyAId),
  });
  assert.equal(response.status, 403);
});

test('company admin cannot change global state or another company membership', async () => {
  const globalResponse = await requestJson(`/api/users/${targetUserId}`, {
    method: 'PUT',
    headers: companyHeaders(adminToken, companyAId),
    body: JSON.stringify({ is_active: false }),
  });
  assert.equal(globalResponse.status, 403);

  const crossCompanyResponse = await requestJson(`/api/users/${targetUserId}`, {
    method: 'PUT',
    headers: companyHeaders(adminToken, companyAId),
    body: JSON.stringify({
      memberships: [{ company_id: companyBId, role: 'viewer', is_active: false }],
    }),
  });
  assert.equal(crossCompanyResponse.status, 403);

  const user = await query('SELECT is_active FROM users WHERE id = $1', [targetUserId]);
  const companyBMembership = await query(
    'SELECT role, is_active FROM user_companies WHERE user_id = $1 AND company_id = $2',
    [targetUserId, companyBId]
  );
  assert.equal(user.rows[0].is_active, true);
  assert.deepEqual(companyBMembership.rows[0], { role: 'admin', is_active: true });
});

test('company admin creates the requested company role instead of viewer fallback', async () => {
  const response = await requestJson('/api/users', {
    method: 'POST',
    headers: companyHeaders(adminToken, companyAId),
    body: JSON.stringify({
      email: 'editor-a@flussio.local',
      password: 'flussio123',
      memberships: [{ company_id: companyAId, role: 'editor', is_active: true }],
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.role, 'editor');
});

test('superadmin can change global state and manage multiple memberships', async () => {
  const response = await requestJson(`/api/users/${targetUserId}`, {
    method: 'PUT',
    headers: companyHeaders(superAdminToken, companyAId),
    body: JSON.stringify({
      is_active: false,
      memberships: [
        { company_id: companyAId, role: 'viewer', is_active: true },
        { company_id: companyBId, role: 'editor', is_active: true },
      ],
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.is_active, false);
  assert.deepEqual(
    response.body.memberships.map(({ company_id, role, is_active }) => ({ company_id, role, is_active })),
    [
      { company_id: companyAId, role: 'viewer', is_active: true },
      { company_id: companyBId, role: 'editor', is_active: true },
    ]
  );

  const staleTokenResponse = await requestJson('/api/accounts', {
    headers: companyHeaders(targetToken, companyBId),
  });
  assert.equal(staleTokenResponse.status, 401);
});
