export const financialDeltaClass = (delta, inverse = false) => {
  if (delta == null || delta === 0) return 'kpi-delta-badge neutral';
  const favorable = inverse ? delta < 0 : delta > 0;
  return favorable ? 'kpi-delta-badge positive' : 'kpi-delta-badge negative';
};

export const financialDeltaLabel = (delta, formattedDelta, inverse = false) => {
  if (delta == null) return 'Confronto non disponibile';
  if (delta === 0) return `Invariato (${formattedDelta})`;
  const favorable = inverse ? delta < 0 : delta > 0;
  return `${favorable ? 'Andamento favorevole' : 'Andamento sfavorevole'} (${formattedDelta})`;
};
