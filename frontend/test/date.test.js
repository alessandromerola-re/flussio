import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateInTimeZone } from '../src/utils/date.js';

test('formats Rome calendar dates deterministically around midnight and DST', () => {
  assert.equal(formatDateInTimeZone(new Date('2026-01-01T23:30:00Z')), '2026-01-02');
  assert.equal(formatDateInTimeZone(new Date('2026-03-29T00:30:00Z')), '2026-03-29');
  assert.equal(formatDateInTimeZone(new Date('2026-03-29T22:30:00Z')), '2026-03-30');
  assert.equal(formatDateInTimeZone(new Date('2026-10-25T00:30:00Z')), '2026-10-25');
  assert.equal(formatDateInTimeZone(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});
