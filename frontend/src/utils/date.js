const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoMonthRegex = /^\d{4}-\d{2}$/;

export const toIsoDatePart = (value) => {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') {
    return '';
  }

  const datePart = value.includes('T') ? value.split('T')[0] : value.slice(0, 10);
  return isoDateRegex.test(datePart) ? datePart : '';
};

export const formatDateIT = (value) => {
  const isoDate = toIsoDatePart(value);
  if (!isoDateRegex.test(isoDate)) {
    return '';
  }

  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
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
