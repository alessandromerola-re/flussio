import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateInTimeZone, formatTimestampDateIT, formatDateIT } from '../src/utils/date.js';

test('formats Rome calendar dates deterministically around midnight and DST', () => {
  assert.equal(formatDateInTimeZone(new Date('2026-01-01T23:30:00Z')), '2026-01-02');
  assert.equal(formatDateInTimeZone(new Date('2026-03-29T00:30:00Z')), '2026-03-29');
  assert.equal(formatDateInTimeZone(new Date('2026-03-29T22:30:00Z')), '2026-03-30');
  assert.equal(formatDateInTimeZone(new Date('2026-10-25T00:30:00Z')), '2026-10-25');
  assert.equal(formatDateInTimeZone(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('timestamp dates use Rome in summer, winter, DST transitions and new year', () => {
  for (const [instant, expected] of [
    ['2026-08-31T22:05:00Z', '01/09/2026'],
    ['2026-01-31T23:05:00Z', '01/02/2026'],
    ['2026-03-29T22:05:00Z', '30/03/2026'],
    ['2026-10-25T23:05:00Z', '26/10/2026'],
    ['2026-12-31T23:05:00Z', '01/01/2027'],
    ['2026-09-01T00:05:00+02:00', '01/09/2026'],
  ]) {
    assert.equal(formatTimestampDateIT(instant), expected);
    assert.equal(formatTimestampDateIT(new Date(instant)), expected);
  }
});

test('timestamp formatter preserves date-only values and rejects missing or invalid values', () => {
  assert.equal(formatTimestampDateIT('2026-09-01'), '01/09/2026');
  assert.equal(formatDateIT('2026-08-31T22:05:00Z'), '31/08/2026');
  for (const value of [null, undefined, '', 'invalid', new Date(NaN)]) {
    assert.equal(formatTimestampDateIT(value), '');
  }
});
