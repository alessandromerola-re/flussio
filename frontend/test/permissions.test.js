import test from 'node:test';
import assert from 'node:assert/strict';
import { canPermission } from '../src/utils/permissions.js';

test('frontend hides sensitive commands using the backend permission matrix', () => {
  assert.equal(canPermission('import', 'operatore'), false);
  assert.equal(canPermission('export', 'viewer'), false);
  assert.equal(canPermission('write', 'operatore'), true);
  assert.equal(canPermission('import', 'editor'), true);
  assert.equal(canPermission('users_manage', 'editor'), false);
  assert.equal(canPermission('users_manage', 'admin'), true);
});
