import test from 'node:test';
import assert from 'node:assert/strict';
import { canPermission } from '../src/utils/permissions.js';

const expected = {
  viewer: [false, false, false, false, false, false],
  operatore: [true, false, false, false, false, false],
  editor: [true, true, true, true, false, false],
  admin: [true, true, true, true, true, true],
};

for (const [role, values] of Object.entries(expected)) {
  test(`${role} exposes only backend-supported commands`, () => {
    assert.deepEqual(
      ['write', 'delete_sensitive', 'import', 'export', 'import_movements', 'users_manage'].map((permission) => canPermission(permission, role)),
      values
    );
  });
}
