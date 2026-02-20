import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCycleKey,
  computeNextRunDateFromCurrent,
  getInitialRunDateForTemplate,
} from '../src/services/recurring.js';

test('monthly start_date not first day -> first run next month day 1', () => {
  const template = {
    frequency: 'monthly',
    interval: 1,
    start_date: '2026-02-16',
  };

  const initial = getInitialRunDateForTemplate(template, new Date('2026-02-16T10:00:00Z'));
  assert.equal(initial.year, 2026);
  assert.equal(initial.month, 3);
  assert.equal(initial.day, 1);
});

test('yearly 29/02 fallback to 28/02 on non leap years', () => {
  const template = {
    frequency: 'yearly',
    interval: 1,
    yearly_anchor_mm: 2,
    yearly_anchor_dd: 29,
  };

  const next = computeNextRunDateFromCurrent(template, { year: 2024, month: 2, day: 29 });
  assert.equal(next.year, 2025);
  assert.equal(next.month, 2);
  assert.equal(next.day, 28);
});

test('cycle key deterministic for same template and run date', () => {
  const monthlyTemplate = { frequency: 'monthly' };
  const runDate = { year: 2026, month: 7, day: 1 };

  const key1 = computeCycleKey(monthlyTemplate, runDate);
  const key2 = computeCycleKey(monthlyTemplate, runDate);

  assert.equal(key1, '2026-07');
  assert.equal(key1, key2);
});
