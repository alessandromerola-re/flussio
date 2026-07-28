export const getCostVariancePresentation = (value) => {
  const amount = Number(value || 0);
  if (amount > 0) return { className: 'negative', icon: '▲', label: 'Sforamento costi' };
  if (amount < 0) return { className: 'positive', icon: '▼', label: 'Risparmio sui costi' };
  return { className: 'neutral', icon: '●', label: 'Costi in linea con il previsto' };
};
