import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, getActiveCompanyId, getContextRevision, setRole, setActiveCompanyId } from '../services/api.js';
import { capabilityView } from './capabilities.js';

const denied = capabilityView(null);
export const CompanyCapabilitiesContext = createContext({ ...denied, loading: true, error: null, refresh: () => {} });
export const useCompanyCapabilities = () => useContext(CompanyCapabilitiesContext);
const identity = () => ({ token: getToken(), company: getActiveCompanyId(), revision: getContextRevision() });
export function CompanyCapabilitiesProvider({ children }) {
  const [context, setContext] = useState(identity);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const requestId = useRef(0);
  useEffect(() => {
    const changed = () => { requestId.current += 1; setProfile(null); setError(null); setLoading(true); setContext(identity()); };
    window.addEventListener('flussio-context-change', changed);
    return () => { requestId.current += 1; window.removeEventListener('flussio-context-change', changed); };
  }, []);
  useEffect(() => {
    const refresh = () => { if (getToken() && document.visibilityState !== 'hidden') setRefreshCount(value => value + 1); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    window.addEventListener('flussio-module-access-denied', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('flussio-module-access-denied', refresh); };
  }, []);
  useEffect(() => {
    const generation = ++requestId.current;
    if (!context.token) { setProfile(null); setLoading(false); return; }
    let current = true;
    setLoading(true);
    api.getCurrentCapabilities().then(next => {
      if (!current || generation !== requestId.current || context.revision !== getContextRevision()) return;
      if (!next || typeof next.version !== 'string' || !/^(0|[1-9]\d*)$/.test(next.version) || !Array.isArray(next.modules) || !next.capabilities || !next.role) throw new Error('Invalid company capabilities');
      if (next.company_id && !getActiveCompanyId()) { setActiveCompanyId(next.company_id); return; }
      if (!next || String(next.company_id) !== String(getActiveCompanyId()) || !next.capabilities || !next.role) throw new Error('Invalid company capabilities');
      setRole(next.role);
      setProfile(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setError(null);
    }).catch(failure => {
      if (!current || generation !== requestId.current) return;
      setProfile(null); setError(failure);
    }).finally(() => { if (current && generation === requestId.current) setLoading(false); });
    return () => { current = false; };
  }, [context, refreshCount]);
  const value = useMemo(() => ({ ...capabilityView(profile), loading, error, refresh: () => setRefreshCount(count => count + 1) }), [profile, loading, error]);
  return <CompanyCapabilitiesContext.Provider value={value}>{children}</CompanyCapabilitiesContext.Provider>;
}
