export const loadDashboardData = async ({ client, range, period, incomeDimension, expenseDimension }) => {
  const [summary, incomePie, expensePie, topExpenses] = await Promise.all([
    client.getDashboardSummary({ ...range, period }),
    client.getDashboardPie({ ...range, kind: 'income', dimension: incomeDimension, topN: 12 }),
    client.getDashboardPie({ ...range, kind: 'expense', dimension: expenseDimension, topN: 12 }),
    client.getDashboardPie({ ...range, kind: 'expense', dimension: 'category', topN: 10 }),
  ]);
  return { summary, incomePie, expensePie, topExpenses };
};
