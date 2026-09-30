import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCapabilities } from '../src/modules/reportAccess.js';
import { validateAndNormalizeSpec } from '../src/services/advancedReports.js';
const spec = input => validateAndNormalizeSpec({ dateFrom: '2026-09-01', dateTo: '2026-09-30', ...input }, 7);
test('capabilities follow normalized dimensions, aliases and combined filters', () => {
  assert.deepEqual(reportCapabilities(spec({ groupBy: ['job', 'property'] })), ['general_reports', 'job_reports', 'property_reports']);
  assert.deepEqual(reportCapabilities(spec({ filters: { job_id: '4' } })), ['general_reports', 'job_reports']);
  assert.deepEqual(reportCapabilities(spec({ filters: { propertyId: null, property_id: 9 } })), ['general_reports', 'property_reports']);
  assert.deepEqual(reportCapabilities(spec({ filters: { jobId: 1, property_id: 2 }, groupBy: ['job'] })), ['general_reports', 'job_reports', 'property_reports']);
});
test('budget and optional quality dimensions require their modules', () => {
  assert.deepEqual(reportCapabilities(spec({ reportKind: 'budget', groupBy: ['job'] })), ['general_reports', 'job_reports']);
  assert.deepEqual(reportCapabilities(spec({ reportKind: 'quality', qualityDimensions: ['property', 'job'] })), ['general_reports', 'job_reports', 'property_reports']);
});
test('general reports and comparisons remain Base; forged capabilities have no effect', () => {
  for (const input of [{}, { reportKind: 'quality' }, { reportKind: 'yoy', groupBy: ['month'] }, { reportKind: 'mom', groupBy: ['month'], filters: { type: 'expense' } }]) {
    assert.deepEqual(reportCapabilities(spec({ ...input, capabilities: [], states: { jobs: 'enabled' } })), ['general_reports']);
  }
  assert.deepEqual(reportCapabilities(spec({ reportKind: 'standard', qualityDimensions: ['job'] })), ['general_reports']);
});
test('invalid specs cannot silently become Base snapshots', () => {
  for (const input of [null, {}, { error: {} }, spec({ filters: { jobId: -1 } }), spec({ reportKind: 'quality', qualityDimensions: ['unavailable'] })]) {
    assert.throws(() => reportCapabilities(input), /Invalid normalized report/);
  }
});
