import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboardData } from '../src/utils/dashboardLoader.js';

const pie = { slices: [], others_cents: 0 };
test('dashboard loader preserves real zero values', async () => {
  const client = { getDashboardSummary: async () => ({ income_sum_cents: 0, expense_sum_cents: 0 }), getDashboardPie: async () => pie };
  const result = await loadDashboardData({ client, range: {}, period: 'currentmonth', incomeDimension: 'category', expenseDimension: 'category' });
  assert.equal(result.summary.income_sum_cents, 0);
  assert.equal(result.incomePie, pie);
});

test('dashboard loader rejects when data is unavailable and can be retried', async () => {
  let attempts = 0;
  const client = { getDashboardSummary: async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); return { income_sum_cents: 1 }; }, getDashboardPie: async () => pie };
  const args = { client, range: {}, period: 'currentmonth', incomeDimension: 'category', expenseDimension: 'category' };
  await assert.rejects(loadDashboardData(args), /offline/);
  assert.equal((await loadDashboardData(args)).summary.income_sum_cents, 1);
});
