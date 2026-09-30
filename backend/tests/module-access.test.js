import test from 'node:test';
import assert from 'node:assert/strict';
import { assertModuleAccess, assertModuleLinkChanges, parseModuleLinks, recurringModuleBlock } from '../src/modules/access.js';

test('module access defaults to denied and technical availability precedes module states', () => {
  assert.throws(() => assertModuleAccess({ jobs: 'enabled' }, ['jobs'], 'write'), { code: 'FORBIDDEN' });
  assert.throws(() => assertModuleAccess({ jobs: 'enabled' }, ['jobs'], 'write', { permissionGranted: true, technicalEnabled: false }), { code: 'FEATURE_UNAVAILABLE' });
});

test('recurring eligibility requires every linked module but preserves Base independence', () => {
  assert.equal(recurringModuleBlock({ jobs: 'disabled', real_estate: 'read_only' }, {}), null);
  assert.equal(recurringModuleBlock({ jobs: 'read_only' }, { job_id: 1 }).code, 'MODULE_READ_ONLY');
  assert.equal(recurringModuleBlock({ jobs: 'enabled', real_estate: 'disabled' }, { job_id: 1, property_id: 2 }).module, 'real_estate');
  assert.equal(recurringModuleBlock({}, { property_id: 2 }).code, 'MODULE_DISABLED');
  assert.equal(recurringModuleBlock({ jobs: 'enabled', real_estate: 'enabled' }, { job_id: 1, property_id: 2 }), null);
});
test('module links distinguish omission, explicit null and matching aliases', () => {
  assert.deepEqual(parseModuleLinks({ description: 'Changed' }), {});
  assert.deepEqual(parseModuleLinks({ job_id: null, propertyId: '12' }), { job_id: null, property_id: 12 });
  assert.deepEqual(parseModuleLinks({ job_id: '10', jobId: 10 }), { job_id: 10 });
  assert.throws(() => parseModuleLinks({ job_id: null, jobId: 10 }), { code: 'VALIDATION_MISSING_FIELDS' });
  for (const value of [0, -1, 2147483648, 1.5, true, [], {}, 'invalid']) {
    assert.throws(() => parseModuleLinks({ property_id: value }), { code: 'VALIDATION_MISSING_FIELDS' });
  }
});
test('unchanged historical links survive read-only/disabled states; assignment and removal require write', () => {
  const old = { job_id: 2, property_id: 3 }, options = { permissionGranted: true };
  for (const state of ['read_only', 'disabled']) {
    const states = { jobs: state, real_estate: state };
    assert.doesNotThrow(() => assertModuleLinkChanges(states, old, { ...old }, options));
    assert.throws(() => assertModuleLinkChanges(states, old, { ...old, job_id: null }, options));
    assert.throws(() => assertModuleLinkChanges(states, {}, { property_id: 3 }, options));
  }
  assert.doesNotThrow(() => assertModuleLinkChanges({ jobs: 'enabled', real_estate: 'enabled' }, old, {}, options));
});
