import test from 'node:test';
import assert from 'node:assert/strict';
import { canRole } from '../src/middleware/permissions.js';

test('role/action matrix follows the backend authority', () => {
  assert.equal(canRole('viewer', 'write'), false);
  assert.equal(canRole('operatore', 'write'), true);
  assert.equal(canRole('operatore', 'delete_sensitive'), false);
  assert.equal(canRole('editor', 'export'), true);
  assert.equal(canRole('editor', 'users_manage'), false);
  assert.equal(canRole('admin', 'users_manage'), true);
});
