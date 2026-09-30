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

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const prepare = async () => {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  globalThis.window = { location: { href: '' } };
  const service = await import('../src/services/api.js');
  service.setToken('current-token', 'admin'); service.setActiveCompanyId(1);
  return service;
};

test('company A-B-A discards an old response even when the company id matches again', async () => {
  const { api, setActiveCompanyId } = await prepare();
  const pending = deferred(); globalThis.fetch = () => pending.promise;
  const rejected = assert.rejects(api.getAccounts(), { code: 'CONTEXT_CHANGED' });
  setActiveCompanyId(2); setActiveCompanyId(1);
  pending.resolve(json([{ id: 123, name: 'Old A' }])); await rejected;
});

test('a stale unauthorized response cannot refresh or clear the new session', async () => {
  const { api, setToken } = await prepare();
  const pending = deferred(); let calls = 0;
  globalThis.fetch = () => { calls++; return pending.promise; };
  const rejected = assert.rejects(api.getAccounts(), { code: 'CONTEXT_CHANGED' });
  setToken('new-session', 'viewer'); pending.resolve(json({}, 401)); await rejected;
  assert.equal(calls, 1); assert.equal(localStorage.getItem('flussio_token'), 'new-session');
  assert.equal(window.location.href, '');
});

test('a refresh finishing after a company change cannot overwrite session, role or company', async () => {
  const { api, setActiveCompanyId, setToken } = await prepare();
  const pending = deferred(), started = deferred(); let calls = 0;
  globalThis.fetch = async () => { calls++; if (calls === 1) return json({}, 401); started.resolve(); return pending.promise; };
  const rejected = assert.rejects(api.getAccounts(), { code: 'CONTEXT_CHANGED' });
  await started.promise; setActiveCompanyId(2); setToken('new-session', 'editor');
  pending.resolve(json({ token: 'old-renewed', role: 'admin', companies: [{ id: 1 }], default_company_id: 1 }));
  await rejected;
  assert.equal(calls, 2); assert.equal(localStorage.getItem('flussio_token'), 'new-session');
  assert.equal(localStorage.getItem('flussio_role'), 'editor'); assert.equal(localStorage.getItem('flussio_company_id'), '2');
});

test('loss of an explicit company during refresh selects the default but never retries its old operation there', async () => {
  const { api } = await prepare(); let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? json({}, 401) : json({ token: 'renewed', role: 'admin', companies: [{ id: 2 }], default_company_id: 2 });
  await assert.rejects(api.getAccounts(), { code: 'CONTEXT_CHANGED' });
  assert.equal(calls, 2); assert.equal(localStorage.getItem('flussio_company_id'), '2');
  assert.equal(localStorage.getItem('flussio_token'), 'renewed'); assert.equal(window.location.href, '');
});

test('company changes during CSV body parsing discard the old download', async () => {
  const { api, setActiveCompanyId } = await prepare(); const body = deferred(), started = deferred();
  globalThis.fetch = async () => ({ status: 200, ok: true, headers: new Headers(), blob: () => { started.resolve(); return body.promise; } });
  const rejected = assert.rejects(api.exportAdvancedReportCsv({ snapshot_id: 'old' }), { code: 'CONTEXT_CHANGED' });
  await started.promise; setActiveCompanyId(2); body.resolve(new Blob(['private-old-company'])); await rejected;
});

test('CSV refusals retain structured module errors for the interface', async () => {
  const { api } = await prepare();
  globalThis.fetch = async () => json({ error: { code: 'MODULE_DISABLED', message: 'Disabled', details: { module: 'jobs' } } }, 403);
  await assert.rejects(api.exportAdvancedReportCsv({ snapshot_id: 'blocked' }), error => error.code === 'MODULE_DISABLED' && error.details.module === 'jobs');
});
