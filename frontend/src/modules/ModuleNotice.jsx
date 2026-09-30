import { useTranslation } from 'react-i18next';
import { useCompanyCapabilities } from './CompanyCapabilities.jsx';
export default function ModuleNotice({ module }) {
  const { t } = useTranslation(); const capabilities = useCompanyCapabilities();
  return capabilities.state(module) === 'read_only' ? <p className="muted" role="status">{t('modules.ui.readOnly')}</p> : null;
}
export function CapabilityRoute({ capability, children }) {
  const { t } = useTranslation(); const modules = useCompanyCapabilities();
  return modules.can(capability, 'read') ? children : <div className="card" role="alert">{t('errors.MODULE_DISABLED')}</div>;
}
