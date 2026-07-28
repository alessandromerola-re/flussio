export const signalForDelta = (value, { inverse = false } = {}) => {
  const numeric = Number(value || 0);
  if (numeric === 0) return { className: 'neutral', label: 'invariato' };
  const favorable = inverse ? numeric < 0 : numeric > 0;
  return favorable
    ? { className: 'positive', label: 'miglioramento' }
    : { className: 'negative', label: 'peggioramento' };
};
