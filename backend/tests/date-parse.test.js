import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateISO, parseCsvDateToISO } from '../src/utils/dateParse.js';

test('parseCsvDateToISO accepts ISO date', () => {
  assert.equal(parseCsvDateToISO('2026-02-19'), '2026-02-19');
});

test('parseCsvDateToISO accepts IT date DD/MM/YYYY', () => {
  assert.equal(parseCsvDateToISO('19/02/2026'), '2026-02-19');
});

test('parseCsvDateToISO accepts legacy JS date export format', () => {
  assert.equal(
    parseCsvDateToISO('Thu Feb 19 2026 00:00:00 GMT+0000 (Coordinated Universal Time)'),
    '2026-02-19'
  );
});

test('formatDateISO normalizes date-like input to ISO', () => {
  assert.equal(formatDateISO(new Date('2026-02-19T10:30:00.000Z')), '2026-02-19');
});

test('parseCsvDateToISO throws for invalid values', () => {
  assert.throws(() => parseCsvDateToISO('31/02/2026'), /Invalid date/);
});
