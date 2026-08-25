import test from 'node:test';
import assert from 'node:assert/strict';
import { canRole, requirePermission } from '../src/middleware/permissions.js';

test('role/action matrix follows the backend authority', () => {
  assert.equal(canRole('viewer', 'write'), false);
  assert.equal(canRole('operatore', 'write'), true);
  assert.equal(canRole('operatore', 'delete_sensitive'), false);
  assert.equal(canRole('editor', 'export'), true);
  assert.equal(canRole('editor', 'users_manage'), false);
  assert.equal(canRole('editor', 'import'), true);
  assert.equal(canRole('editor', 'import_movements'), false);
  assert.equal(canRole('admin', 'users_manage'), true);
  assert.equal(canRole('admin', 'import_movements'), true);
  assert.equal(canRole('admin', 'reconcile_accounts'), true);
  assert.equal(canRole('editor', 'reconcile_accounts'), false);
});

test('permission middleware rejects a direct unauthorized request with 403', () => {
  const req = { companyRole: 'editor' };
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  requirePermission('users_manage')(req, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error_code, 'FORBIDDEN');
  assert.equal(nextCalled, false);
});

test('permission middleware allows the supported role/action pair', () => {
  let nextCalled = false;
  requirePermission('import')({ companyRole: 'editor' }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
