export const readCompanies = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('flussio_companies') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

// Updating the selector does not change the active company/session revision:
// open pages and their unsaved work must survive a list-only refresh.
export const writeCompanies = (companies) => {
  localStorage.setItem('flussio_companies', JSON.stringify(companies || []));
  if (typeof window !== 'undefined') window.dispatchEvent?.(new Event('flussio-companies-change'));
};
