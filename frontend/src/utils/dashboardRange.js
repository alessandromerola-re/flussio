import { formatDateInTimeZone } from './date.js';

export function buildDashboardRange(preset, now = new Date()) {
  const to = formatDateInTimeZone(now);
  const [year, month, day] = to.split('-').map(Number);
  let from;
  if (preset === 'last30days') from = new Date(Date.UTC(year, month - 1, day - 29));
  else if (preset === 'currentmonth') from = new Date(Date.UTC(year, month - 1, 1));
  else if (preset === 'currentyear') from = new Date(Date.UTC(year, 0, 1));
  else from = new Date(Date.UTC(year, month - 6, 1));
  return { from: from.toISOString().slice(0, 10), to };
}
