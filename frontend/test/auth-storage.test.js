import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, isPersistentSession, readSession, writeSession } from '../src/utils/authStorage.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};

test('remember me selects exactly one storage and preserves legacy local sessions', () => {
  const local = storage(); const session = storage();
  local.setItem('flussio_token', 'legacy');
  assert.equal(readSession(local, session).token, 'legacy');
  writeSession('temporary', 'operatore', false, local, session);
  assert.equal(local.getItem('flussio_token'), null);
  assert.equal(isPersistentSession(local, session), false);
  assert.deepEqual(readSession(local, session), { token: 'temporary', role: 'operatore' });
  writeSession('persistent', 'admin', true, local, session);
  assert.equal(session.getItem('flussio_token'), null);
  assert.equal(isPersistentSession(local, session), true);
  assert.deepEqual(readSession(local, session), { token: 'persistent', role: 'admin' });
  clearSession(local, session);
  assert.equal(readSession(local, session).token, null);
});
