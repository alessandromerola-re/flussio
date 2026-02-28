const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const itDateRegex = /^\d{2}\/\d{2}\/\d{4}$/;

const isValidIsoDateParts = (year, month, day) => {
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year
    && utcDate.getUTCMonth() === month - 1
    && utcDate.getUTCDate() === day
  );
};

const toIsoFromDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseCsvDateToISO = (input) => {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Invalid date');
  }

  if (isoDateRegex.test(raw)) {
    const [yearStr, monthStr, dayStr] = raw.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!isValidIsoDateParts(year, month, day)) {
      throw new Error('Invalid date');
    }
    return raw;
  }

  if (itDateRegex.test(raw)) {
    const [dayStr, monthStr, yearStr] = raw.split('/');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!isValidIsoDateParts(year, month, day)) {
      throw new Error('Invalid date');
    }
    return `${yearStr}-${monthStr}-${dayStr}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date');
  }

  return toIsoFromDate(parsed);
};

export const formatDateISO = (dateLike) => parseCsvDateToISO(dateLike);
