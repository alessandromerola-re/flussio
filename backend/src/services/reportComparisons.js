import { buildTotalsQuery, buildFilterSql, accountJoin } from './advancedReports.js';

const cents = (value) => BigInt(value ?? 0);
const delta = (current, previous) => current == null || previous == null ? null : (cents(current) - cents(previous)).toString();
export const changePercent = (current, previous) => {
  if (current == null || previous == null || cents(previous) === 0n) return null;
  const base = cents(previous) < 0n ? -cents(previous) : cents(previous);
  const scaled = (cents(current) - cents(previous)) * 10000n / base;
  return `${scaled < 0n ? '-' : ''}${(scaled < 0n ? -scaled : scaled) / 100n}.${String((scaled < 0n ? -scaled : scaled) % 100n).padStart(2, '0')}`;
};
const iso = (date) => date.toISOString().slice(0, 10);
const lastDay = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const shift = (value, months, endOfMonth = false) => {
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  target.setUTCDate(endOfMonth && day === lastDay(year, month - 1) ? lastDay(target.getUTCFullYear(), target.getUTCMonth()) : Math.min(day, lastDay(target.getUTCFullYear(), target.getUTCMonth())));
  return iso(target);
};
export const comparisonWindows = (spec) => {
  const result = [];
  const cursor = new Date(`${spec.dateFrom.slice(0, 7)}-01T00:00:00Z`);
  while (iso(cursor) <= spec.dateTo) {
    const bucket = iso(cursor).slice(0, 7);
    const from = spec.dateFrom > `${bucket}-01` ? spec.dateFrom : `${bucket}-01`;
    const monthEnd = `${bucket}-${lastDay(cursor.getUTCFullYear(), cursor.getUTCMonth())}`;
    const to = spec.dateTo < monthEnd ? spec.dateTo : monthEnd;
    const offset = spec.reportKind === 'yoy' ? -12 : -1;
    result.push({ bucket, current_from: from, current_to: to, previous_from: shift(from, offset), previous_to: shift(to, offset, true) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
};

export const runSpecialReport = async (client, spec) => {
  if (spec.reportKind === 'budget') return runBudget(client, spec);
  if (spec.reportKind === 'quality') return runQuality(client, spec);
  const metric = spec.reportKind === 'yoy' ? 'net_sum_cents' : 'expense_sum_cents';
  const windows = comparisonWindows(spec);
  const rows = [];
  for (const window of windows.slice(0, spec.limit)) {
    const read = async (from, to) => {
      const query = buildTotalsQuery({ ...spec, dateFrom: from, dateTo: to });
      return (await client.query(query.text, query.values)).rows[0];
    };
    const current = await read(window.current_from, window.current_to);
    const previous = await read(window.previous_from, window.previous_to);
    rows.push({ ...window, current_cents: String(current[metric]), previous_cents: String(previous[metric]), delta_cents: delta(current[metric], previous[metric]), change_pct: changePercent(current[metric], previous[metric]), count: current.count, previous_count: previous.count });
  }
  return { rows, columns: ['bucket','current_from','current_to','previous_from','previous_to','current_cents','previous_cents','delta_cents','change_pct','count','previous_count'], truncated: windows.length > spec.limit, amount_basis: spec.filters.accountId != null ? 'account_allocations' : 'movements', report_note: 'calendarComparison' };
};

const runBudget = async (client, spec) => {
  const result = await client.query(`
    SELECT j.id AS job_id, COALESCE(j.title,j.name) AS job_title,
      j.expected_revenue_cents, j.expected_cost_cents,
      COALESCE(SUM(CASE WHEN t.type='income' THEN ROUND(t.amount_total*100)::bigint ELSE 0 END),0)::text AS income_sum_cents,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN ABS(ROUND(t.amount_total*100)::bigint) ELSE 0 END),0)::text AS expense_sum_cents,
      COUNT(t.id)::int AS count
    FROM jobs j LEFT JOIN transactions t ON t.job_id=j.id AND t.company_id=j.company_id AND t.type IN ('income','expense')
    WHERE j.company_id=$1 AND ($2::int IS NULL OR j.id=$2)
    GROUP BY j.id ORDER BY j.id LIMIT $3`, [spec.companyId, spec.filters.jobId, spec.limit + 1]);
  const rows = result.rows.slice(0,spec.limit).map((row) => {
    const net = delta(row.income_sum_cents, row.expense_sum_cents);
    const expected = delta(row.expected_revenue_cents, row.expected_cost_cents);
    return {...row, net_sum_cents:net, expected_net_cents:expected, revenue_variance_cents:delta(row.income_sum_cents,row.expected_revenue_cents), cost_variance_cents:delta(row.expense_sum_cents,row.expected_cost_cents), margin_variance_cents:delta(net,expected)};
  });
  return {rows, columns:['job_title','expected_revenue_cents','income_sum_cents','revenue_variance_cents','expected_cost_cents','expense_sum_cents','cost_variance_cents','expected_net_cents','net_sum_cents','margin_variance_cents','count'], truncated: result.rows.length > spec.limit, amount_basis:'movements', report_note:'lifetimeBudget'};
};

const runQuality = async (client, spec) => {
  const {where,params,withRecursive}=buildFilterSql(spec);
  // A link is valid only within the selected company. Optional dimensions are opt-in.
  const tables={category:'categories',contact:'contacts',job:'jobs',property:'properties'};
  const predicates=spec.qualityDimensions.map((dimension) => dimension==='account'
    ? 'NOT EXISTS (SELECT 1 FROM transaction_accounts ta JOIN accounts acc ON acc.id=ta.account_id AND acc.company_id=t.company_id WHERE ta.transaction_id=t.id)'
    : `NOT EXISTS (SELECT 1 FROM ${tables[dimension]} link WHERE link.id=t.${dimension}_id AND link.company_id=t.company_id)`);
  const q=`${withRecursive} SELECT COUNT(DISTINCT t.id)::int AS total, ${predicates.map((predicate,i)=>`COUNT(DISTINCT t.id) FILTER (WHERE ${predicate})::int AS missing_${i}`).join(',')} FROM transactions t ${accountJoin(spec)} WHERE ${where.join(' AND ')}`;
  const data=(await client.query(q,params)).rows[0];
  const rows=spec.qualityDimensions.map((dimension,i)=>({dimension,missing_count:data[`missing_${i}`],total_count:data.total,missing_pct:data.total ? (100*data[`missing_${i}`]/data.total).toFixed(2):null}));
  return {rows,columns:['dimension','missing_count','total_count','missing_pct'],truncated:false,report_note:'qualityLinks',amount_basis:'movements'};
};
