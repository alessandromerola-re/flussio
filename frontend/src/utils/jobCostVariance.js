export const getCostVariancePresentation = (value) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return { className: 'neutral', icon: '—', label: 'Confronto costi non disponibile' };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return { className: 'neutral', icon: '—', label: 'Confronto costi non disponibile' };
  }
  if (amount > 0) return { className: 'negative', icon: '▲', label: 'Sforamento costi' };
  if (amount < 0) return { className: 'positive', icon: '▼', label: 'Risparmio sui costi' };
  return { className: 'neutral', icon: '●', label: 'Costi in linea con il previsto' };
};
