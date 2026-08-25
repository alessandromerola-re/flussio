import test from 'node:test';
import assert from 'node:assert/strict';

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('an expired access token is refreshed once and the original request is retried', async () => {
  const local = storage();
  const session = storage();
  local.setItem('flussio_token', 'expired-access-token');
  local.setItem('flussio_role', 'admin');
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  globalThis.window = { location: { href: '' } };

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error_code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({
        token: 'renewed-access-token',
        role: 'admin',
        default_company_id: 7,
        companies: [{ id: 7, name: 'Test Co', role: 'admin' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const { api } = await import('../src/services/api.js');
  const accounts = await api.getAccounts();

  assert.deepEqual(accounts, []);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, '/api/auth/refresh');
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer renewed-access-token');
  assert.equal(local.getItem('flussio_token'), 'renewed-access-token');
  assert.equal(local.getItem('flussio_company_id'), '7');
});
