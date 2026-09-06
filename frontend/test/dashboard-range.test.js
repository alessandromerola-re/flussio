import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardRange } from '../src/utils/dashboardRange.js';
test('dashboard ranges follow the Rome calendar across UTC midnight and year boundaries', () => {
  const now = new Date('2026-12-31T23:30:00Z');
  assert.deepEqual(buildDashboardRange('currentmonth', now), { from: '2027-01-01', to: '2027-01-01' });
  assert.deepEqual(buildDashboardRange('last6months', now), { from: '2026-08-01', to: '2027-01-01' });
  assert.deepEqual(buildDashboardRange('last30days', now), { from: '2026-12-03', to: '2027-01-01' });
});
