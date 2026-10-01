import { isValidISODate } from './dateParse.js';

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getPeriodRange = (period) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => today.find(p => p.type === type).value;
  const now = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  const end = new Date(now);

  if (period === 'last30days') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 29);
    start.setUTCHours(0, 0, 0, 0);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }

  if (period === 'currentmonth') {
    return { from: toIsoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: toIsoDate(end) };
  }

  if (period === 'currentyear') {
    return { from: toIsoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: toIsoDate(end) };
  }

  // default: last6months
  const sixMonths = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  return { from: toIsoDate(sixMonths), to: toIsoDate(end) };
};

export const getDateRangeFromQuery = (input = {}) => {
  const { from, to, period = 'last6months' } = input;

  if (from || to) {
    if ((from && !isValidISODate(from)) || (to && !isValidISODate(to))) {
      return { error: true };
    }
    const fallback = getPeriodRange(period);
    const resolvedFrom = from || fallback.from;
    const resolvedTo = to || fallback.to;
    if (resolvedFrom > resolvedTo) return { error: true };
    return { from: resolvedFrom, to: resolvedTo };
  }

  return getPeriodRange(period);
};

export const countInclusiveDays = (range) => {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  return Math.floor((to - from) / (24 * 60 * 60 * 1000)) + 1;
};

export const shiftRangeByDays = (range, deltaDays) => {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() + deltaDays);
  to.setUTCDate(to.getUTCDate() + deltaDays);
  return { from: toIsoDate(from), to: toIsoDate(to) };
};

export const buildBuckets = (range, period) => {
  const start = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);
  const buckets = [];
  const twoDigits = (value) => String(value).padStart(2, '0');
  const formatMonthLabel = (date) => `${date.toLocaleString('it-IT', { month: 'short', timeZone: 'UTC' })} ${date.getUTCFullYear()}`;

  if (period === 'last30days' || period === 'currentmonth') {
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = `${d.getUTCFullYear()}-${twoDigits(d.getUTCMonth() + 1)}-${twoDigits(d.getUTCDate())}`;
      buckets.push({ key, label: `${twoDigits(d.getUTCDate())}/${twoDigits(d.getUTCMonth() + 1)}` });
    }
    return { granularity: 'day', buckets };
  }

  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const key = `${d.getUTCFullYear()}-${twoDigits(d.getUTCMonth() + 1)}`;
    buckets.push({ key, label: formatMonthLabel(d) });
  }
  return { granularity: 'month', buckets };
};
