export const euroFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrencyFromCents = (valueCents) => {
  if (valueCents == null || valueCents === '') {
    return null;
  }
  const cents = Number(valueCents);
  if (!Number.isFinite(cents)) {
    return null;
  }
  return euroFormatter.format(cents / 100);
};

export const parseEuroInputToCents = (value) => {
  if (value == null || String(value).trim() === '') {
    return null;
  }

  const normalized = String(value).replace(',', '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
};
