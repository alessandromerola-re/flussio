import { applyBrandingIconsToHead } from '../utils/brandingIcons.js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const getPublicCompanyId = () => {
  const configured = import.meta.env.VITE_PUBLIC_BRANDING_COMPANY_ID;
  if (configured && Number.isInteger(Number(configured)) && Number(configured) > 0) {
    return Number(configured);
  }

  const stored = localStorage.getItem('flussio_company_id');
  if (stored && Number.isInteger(Number(stored)) && Number(stored) > 0) {
    return Number(stored);
  }

  return null;
};

export const bootstrapPublicBrandingIcons = async () => {
  try {
    const companyId = getPublicCompanyId();
    const query = companyId ? `?company_id=${companyId}` : '';
    const response = await fetch(`${API_BASE}/public/branding${query}`);
    if (!response.ok) {
      applyBrandingIconsToHead({});
      return;
    }

    const data = await response.json();
    applyBrandingIconsToHead({
      faviconUrl: data?.icons?.variants?.favicon?.url || '',
      appleTouchUrl: data?.icons?.variants?.apple_touch_icon?.url || '',
      manifestUrl: data?.manifest_url || '',
    });
  } catch {
    applyBrandingIconsToHead({});
  }
};
