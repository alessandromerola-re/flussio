const iso = (date) => date.toISOString().slice(0, 10);
const day = (date, delta) => new Date(date.getTime() + delta * 86400000);

export const reportBucketRange = (dimension, bucket) => {
  const value = String(bucket || '');
  let start, end;
  if (dimension === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    start = new Date(`${value}T00:00:00Z`); end = start;
  } else if (dimension === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    start = new Date(`${value}-01T00:00:00Z`); end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); end = day(end, -1);
  } else if (dimension === 'year' && /^\d{4}$/.test(value)) {
    start = new Date(`${value}-01-01T00:00:00Z`); end = new Date(`${value}-12-31T00:00:00Z`);
  } else if (dimension === 'quarter' && /^\d{4}-Q[1-4]$/.test(value)) {
    const month = (Number(value.at(-1)) - 1) * 3;
    start = new Date(`${value.slice(0,4)}-${String(month + 1).padStart(2,'0')}-01T00:00:00Z`);
    end = new Date(start); end.setUTCMonth(month + 3); end = day(end, -1);
  } else if (dimension === 'week' && /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(value)) {
    const jan4 = new Date(`${value.slice(0,4)}-01-04T00:00:00Z`);
    start = day(jan4, -((jan4.getUTCDay() + 6) % 7) + (Number(value.slice(-2)) - 1) * 7);
    end = day(start, 6);
  } else throw new Error('Invalid report bucket');
  if (Number.isNaN(start.getTime()) || (dimension === 'day' && iso(start) !== value)) throw new Error('Invalid report bucket');
  if (dimension === 'week' && day(start, 3).getUTCFullYear() !== Number(value.slice(0,4))) throw new Error('Invalid ISO week');
  return { from: iso(start), to: iso(end) };
};

export const reportDrilldownParams = (spec, row) => {
  const params = new URLSearchParams();
  const filters = spec.filters || {};
  if (spec.dateFrom) params.set('date_from', spec.dateFrom);
  if (spec.dateTo) params.set('date_to', spec.dateTo);
  if (!filters.type || filters.type === 'all') params.set('cashflow_only','1');
  else params.set('type', filters.type);
  for (const dimension of ['account','category','contact','job','property']) {
    if (filters[`${dimension}Id`] != null) params.set(`${dimension}_id`, filters[`${dimension}Id`]);
  }
  if (filters.categoryId != null && filters.includeCategoryChildren) params.set('include_category_children','1');
  if (filters.text) params.set('description_q',filters.text);
  if (filters.isRecurring != null) params.set('is_recurring',filters.isRecurring ? '1' : '0');
  if (filters.hasAttachments != null) params.set('has_attachments',filters.hasAttachments ? '1' : '0');
  for (const dimension of spec.groupBy || []) {
    if (['day','week','month','quarter','year'].includes(dimension)) {
      const range = reportBucketRange(dimension,row.bucket);
      params.set('date_from',spec.dateFrom && spec.dateFrom > range.from ? spec.dateFrom : range.from);
      params.set('date_to',spec.dateTo && spec.dateTo < range.to ? spec.dateTo : range.to);
    } else if (dimension === 'type') {
      params.set('type',row.type);
    } else if (dimension === 'recurring') {
      params.set('is_recurring',row.recurring ? '1' : '0');
    } else {
      const key = `${dimension}_id`;
      if (row[key] == null) { params.delete(key); params.set(`missing_${dimension}`,'1'); }
      else params.set(key,row[key]);
      // A category row is the exact category, even when its source filter includes descendants.
      if (dimension === 'category') params.delete('include_category_children');
    }
  }
  return params;
};
