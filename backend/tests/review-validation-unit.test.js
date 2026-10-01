import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyCents, validMovementAllocation } from '../src/utils/movementValidation.js';
import { parseCsv } from '../src/utils/csv.js';
import { nextRunAtAfterEdit } from '../src/services/recurring.js';

test('allocation validation is exact in cents and rejects invalid monetary input', () => {
  assert.equal(validMovementAllocation('income', 0.3, [{ account_id: 1, direction: 'in', amount: 0.1 }, { account_id: 2, direction: 'in', amount: 0.2 }]), true);
  for (const invalid of ['Infinity', NaN, null, true, '0.001', '10000000000', {}]) assert.equal(moneyCents(invalid), null);
  assert.equal(moneyCents('-12.34', { signed: true }), -1234);
  assert.equal(validMovementAllocation('income', 1, [{ account_id: 1, direction: 'out', amount: 1 }]), false);
});
test('CSV parser preserves escaped quotes, delimiters, multiline fields and physical line numbers', () => {
  assert.deepEqual(parseCsv('name,notes\r\n"A, B","first\r\nsecond ""quoted"""\r\nNext,ok'), [
    { values: ['name','notes'], line: 1 }, { values: ['A, B','first\r\nsecond "quoted"'], line: 2 }, { values: ['Next','ok'], line: 4 },
  ]);
  assert.throws(() => parseCsv('name\n"unfinished'), { code: 'CSV_INVALID_FORMAT' });
});
test('editing recurring metadata preserves the existing due date including PostgreSQL date objects', () => {
  const previous = { frequency: 'monthly', interval: 1, start_date: new Date(2026, 0, 1), next_run_at: '2026-11-30T23:05:00.000Z' };
  assert.equal(nextRunAtAfterEdit({ ...previous, start_date: '2026-01-01', title: 'changed' }, previous), previous.next_run_at);
  assert.equal(nextRunAtAfterEdit({ ...previous, start_date: '2099-06-01' }, previous).toISOString(), '2099-05-31T22:05:00.000Z');
});

test('dashboard calendar ranges do not shift dates or lose days across Rome daylight saving time', async () => {
  const { getDateRangeFromQuery, countInclusiveDays, shiftRangeByDays, buildBuckets } = await import('../src/utils/dashboardDates.js');
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Rome';
    const range = { from: '2026-03-28', to: '2026-03-30' };
    assert.equal(countInclusiveDays(range), 3);
    assert.deepEqual(shiftRangeByDays(range, -3), { from: '2026-03-25', to: '2026-03-27' });
    assert.deepEqual(buildBuckets(range, 'last30days').buckets.map(row => row.key), ['2026-03-28','2026-03-29','2026-03-30']);
    assert.equal(getDateRangeFromQuery({ from: '2026-02-30', to: '2026-03-01' }).error, true);
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});
