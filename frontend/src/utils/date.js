const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoMonthRegex = /^\d{4}-\d{2}$/;

export const toIsoDatePart = (value) => {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return formatDateInTimeZone(value);
  }

  if (typeof value !== 'string') {
    return '';
  }

  const datePart = value.includes('T') ? value.split('T')[0] : value.slice(0, 10);
  return isoDateRegex.test(datePart) ? datePart : '';
};

export const formatDateInTimeZone = (date, timeZone = 'Europe/Rome') => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const formatDateIT = (value) => {
  const isoDate = toIsoDatePart(value);
  if (!isoDateRegex.test(isoDate)) {
    return '';
  }

  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

// Timestamps represent instants; date-only fields represent calendar dates.
export const formatTimestampDateIT = (value) => {
  if (typeof value === 'string' && isoDateRegex.test(value)) return formatDateIT(value);
  if (!(value instanceof Date) && typeof value !== 'string') return '';
  if (!value) return '';
  return formatDateIT(formatDateInTimeZone(value instanceof Date ? value : new Date(value)));
};

export const formatDayMonthIT = (value) => {
  const isoDate = toIsoDatePart(value);
  if (!isoDateRegex.test(isoDate)) {
    return '';
  }

  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
};

export const formatMonthYearIT = (value) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const monthPart = value.slice(0, 7);
  if (!isoMonthRegex.test(monthPart)) {
    return '';
  }

  const [year, month] = monthPart.split('-');
  return `${month}/${year}`;
};
