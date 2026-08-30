import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import routes from './routes.jsx';
import {
  api,
  clearToken,
  getActiveCompanyId,
  getCurrentUser,
  getToken,
  setActiveCompanyId,
  setRole,
} from './services/api.js';
import { can, isRecurringEnabled } from './utils/permissions.js';
import { setLanguage } from './i18n/index.js';
import AppIcon from './components/AppIcon.jsx';
import BrandMark from './components/BrandMark.jsx';
import PageLoader from './components/PageLoader.jsx';
import { applyBrandingIconsToHead } from './utils/brandingIcons.js';
import { bootstrapPublicBrandingIcons } from './services/publicBranding.js';

const readCompanies = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('flussio_companies') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const App = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const brandingRequestIdRef = useRef(0);
  const brandingUrlsRef = useRef({ logo: '', favicon: '', appleTouch: '' });
  const [token, setTokenState] = useState(getToken());
  const [language, setLanguageState] = useState(() => localStorage.getItem('flussio_lang') || 'it');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState(() => document.head.querySelector('link[data-branding-icon="icon"]')?.getAttribute('href') || '');
  const [appleTouchUrl, setAppleTouchUrl] = useState(() => document.head.querySelector('link[data-branding-icon="apple"]')?.getAttribute('href') || '');
  const [manifestUrl, setManifestUrl] = useState(() => document.head.querySelector('link[data-branding-icon="manifest"]')?.getAttribute('href') || '');
  const [companies, setCompanies] = useState(readCompanies);
  const [activeCompanyId, setActiveCompanyIdState] = useState(() => getActiveCompanyId() || '');
  const currentUser = getCurrentUser();

  const loadBrandingAssets = async () => {
    const requestId = ++brandingRequestIdRef.current;
    const requestedToken = getToken();
    const requestedCompanyId = getActiveCompanyId() || '';
    if (!requestedToken) return;

    const isCurrentRequest = () => (
      requestId === brandingRequestIdRef.current
      && getToken() === requestedToken
      && String(getActiveCompanyId() || '') === String(requestedCompanyId)
    );
    const nextUrls = { logo: '', favicon: '', appleTouch: '' };
    const revokeNextUrls = () => {
      Object.values(nextUrls).forEach((url) => {
        if (url) URL.revokeObjectURL?.(url);
      });
    };
    const replaceUrl = (key, url, setter) => {
      const previous = brandingUrlsRef.current[key];
      if (previous && previous !== url) URL.revokeObjectURL?.(previous);
      brandingUrlsRef.current[key] = url;
      setter(url);
    };

    try {
      const branding = await api.getBranding();
      if (!isCurrentRequest()) return;

      const [logoBlob, faviconBlob, appleTouchBlob] = await Promise.all([
        branding?.has_logo ? api.downloadBrandLogo() : null,
        branding?.icons?.variants?.favicon?.available ? api.downloadBrandIcon('favicon') : null,
        branding?.icons?.variants?.apple_touch_icon?.available ? api.downloadBrandIcon('apple-touch-icon') : null,
      ]);

      if (logoBlob) nextUrls.logo = URL.createObjectURL(logoBlob);
      if (faviconBlob) nextUrls.favicon = URL.createObjectURL(faviconBlob);
      if (appleTouchBlob) nextUrls.appleTouch = URL.createObjectURL(appleTouchBlob);
      if (!isCurrentRequest()) {
        revokeNextUrls();
        return;
      }

      replaceUrl('logo', nextUrls.logo, setBrandLogoUrl);
      replaceUrl('favicon', nextUrls.favicon, setFaviconUrl);
      replaceUrl('appleTouch', nextUrls.appleTouch, setAppleTouchUrl);

      const version = branding?.icons?.updated_at ? `${requestedCompanyId ? '&' : '?'}v=${encodeURIComponent(branding.icons.updated_at)}` : '';
      setManifestUrl(`/api/public/branding/manifest.webmanifest${requestedCompanyId ? `?company_id=${requestedCompanyId}` : ''}${version}`);
    } catch {
      revokeNextUrls();
      if (!isCurrentRequest()) return;
      replaceUrl('logo', '', setBrandLogoUrl);
      replaceUrl('favicon', '', setFaviconUrl);
      replaceUrl('appleTouch', '', setAppleTouchUrl);
      setManifestUrl('');
    }
  };

  useEffect(() => {
    loadBrandingAssets();
  }, [token, activeCompanyId]);

  useEffect(() => {
    applyBrandingIconsToHead({ faviconUrl, appleTouchUrl, manifestUrl });
  }, [faviconUrl, appleTouchUrl, manifestUrl]);

  useEffect(() => () => {
    brandingRequestIdRef.current += 1;
    Object.values(brandingUrlsRef.current).forEach((url) => {
      if (url) URL.revokeObjectURL?.(url);
    });
    brandingUrlsRef.current = { logo: '', favicon: '', appleTouch: '' };
  }, []);

  useEffect(() => {
    if (!token) {
      setCompanies([]);
      setActiveCompanyIdState('');
      return;
    }
    setCompanies(readCompanies());
    setActiveCompanyIdState(getActiveCompanyId() || '');
  }, [token]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
    }

    const onKeyDown = (event) => {
      if (!drawerOpen) return;
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = drawerRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (drawerOpen) menuButtonRef.current?.focus();
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      clearToken();
      setTokenState(null);
      setDrawerOpen(false);
      bootstrapPublicBrandingIcons();
      navigate('/login');
    }
  };

  const navGroups = useMemo(() => {
    const core = [
      { path: '/dashboard', label: t('nav.dashboard'), icon: 'dashboard' },
      { path: '/movements', label: t('nav.movements'), icon: 'movements' },
      { path: '/registry', label: t('nav.registry'), icon: 'registry' },
      ...(isRecurringEnabled() ? [{ path: '/recurring', label: t('nav.recurring'), icon: 'recurring' }] : []),
      { path: '/reports/advanced', label: t('nav.reportsAdvanced'), shortLabel: t('nav.reportsShort'), icon: 'reports' },
    ];
    const administration = [
      ...(can('manage_users') ? [{ path: '/users', label: t('nav.users'), icon: 'users' }] : []),
      ...(can('manage_users') ? [{ path: '/settings', label: t('nav.settings'), icon: 'settings' }] : []),
      ...(can('read', 'roadmap') ? [{ path: '/roadmap', label: t('nav.roadmap'), icon: 'roadmap' }] : []),
    ];
    return [
      { id: 'core', label: t('nav.firstNote'), items: core },
      ...(administration.length ? [{ id: 'admin', label: t('nav.administration'), items: administration }] : []),
    ];
  }, [t, activeCompanyId]);

  const allNavItems = navGroups.flatMap((group) => group.items);
  const bottomNavItems = allNavItems.filter((item) => ['/dashboard', '/movements', '/registry', '/reports/advanced'].includes(item.path));
  const currentItem = allNavItems.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const activeCompany = companies.find((company) => String(company.id) === String(activeCompanyId));
  const userInitial = (currentUser.email || 'F').trim().charAt(0).toUpperCase();
  const showCompanySelector = companies.length > 1;

  const handleLanguageChange = (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  };

  const handleCompanyChange = (event) => {
    const nextCompanyId = event.target.value;
    if (!nextCompanyId || String(nextCompanyId) === String(activeCompanyId)) return;
    const selectedCompany = companies.find((company) => String(company.id) === String(nextCompanyId));
    setActiveCompanyId(nextCompanyId);
    setRole(selectedCompany?.role || 'viewer');
    setActiveCompanyIdState(nextCompanyId);
    setDrawerOpen(false);
    navigate('/dashboard');
  };

  const renderNavGroups = (onNavigate) => navGroups.map((group) => (
    <section className="nav-group" key={group.id} aria-labelledby={`nav-${group.id}`}>
      <h2 className="nav-group-label" id={`nav-${group.id}`}>{group.label}</h2>
      <nav className="sidebar-nav">
        {group.items.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`.trim()} onClick={onNavigate}>
            <AppIcon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </section>
  ));

  const renderAccountControls = () => (
    <div className="account-controls">
      {showCompanySelector && (
        <label className="compact-field">
          <span>{t('common.company')}</span>
          <select value={String(activeCompanyId || '')} onChange={handleCompanyChange}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
      )}
      <label className="compact-field">
        <span>{t('common.language')}</span>
        <select value={language} onChange={handleLanguageChange}>
          <option value="it">Italiano</option>
          <option value="en">English</option>
        </select>
      </label>
      <button type="button" className="logout-button" onClick={handleLogout}>
        <AppIcon name="logout" />
        <span>{t('nav.logout')}</span>
      </button>
    </div>
  );

  const brandNode = <BrandMark logoUrl={brandLogoUrl} alt="Logo azienda" />;
  const appRoutes = (
    <Suspense fallback={<PageLoader />}>
      <Routes key={activeCompanyId || 'public'}>
        {routes({ setTokenState, token, onBrandingChanged: loadBrandingAssets, brandLogoUrl }).map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
    </Suspense>
  );

  return (
    <div className="app">
      {token ? (
        <div className="shell">
          <aside className="sidebar desktop-sidebar">
            <Link to="/dashboard" className="sidebar-brand">{brandNode}</Link>
            {activeCompany?.name && <div className="active-company-label" title={activeCompany.name}>{activeCompany.name}</div>}
            <div className="sidebar-groups">{renderNavGroups()}</div>
            <details className="user-menu">
              <summary>
                <span className="user-avatar" aria-hidden="true">{userInitial}</span>
                <span className="user-summary-copy"><strong>{currentUser.email || t('common.user')}</strong><small>{activeCompany?.role || ''}</small></span>
                <AppIcon name="chevron" size={18} />
              </summary>
              {renderAccountControls()}
            </details>
          </aside>

          <header className="mobile-topbar">
            <button ref={menuButtonRef} type="button" className="icon-button" onClick={() => setDrawerOpen(true)} aria-label={t('nav.openMenu')} aria-expanded={drawerOpen}>
              <AppIcon name="menu" size={24} />
            </button>
            <Link to="/dashboard" className="mobile-brand">{brandNode}</Link>
            <button type="button" className="user-avatar mobile-avatar" onClick={() => setDrawerOpen(true)} aria-label={t('nav.openAccountMenu')}>{userInitial}</button>
          </header>

          {drawerOpen && (
            <>
              <div className="drawer-overlay" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
              <aside ref={drawerRef} className="drawer open" role="dialog" aria-modal="true" aria-label={t('nav.mainMenu')}>
                <div className="drawer-header">
                  <Link to="/dashboard" className="sidebar-brand" onClick={() => setDrawerOpen(false)}>{brandNode}</Link>
                  <button ref={drawerCloseRef} type="button" className="icon-button" onClick={() => setDrawerOpen(false)} aria-label={t('nav.closeMenu')}>
                    <AppIcon name="close" size={24} />
                  </button>
                </div>
                {activeCompany?.name && <div className="active-company-label">{activeCompany.name}</div>}
                <div className="drawer-scroll">{renderNavGroups(() => setDrawerOpen(false))}</div>
                <div className="drawer-account">
                  <div className="drawer-user">
                    <span className="user-avatar" aria-hidden="true">{userInitial}</span>
                    <span className="user-summary-copy"><strong>{currentUser.email || t('common.user')}</strong><small>{activeCompany?.role || ''}</small></span>
                  </div>
                  {renderAccountControls()}
                </div>
              </aside>
            </>
          )}

          <main className="content" aria-label={currentItem?.label || t('nav.mainContent')}>{appRoutes}</main>

          <nav className="mobile-bottom-nav" aria-label={t('nav.quickNavigation')}>
            {bottomNavItems.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`.trim()}>
                <AppIcon name={item.icon} size={21} />
                <span>{item.shortLabel || item.label}</span>
              </NavLink>
            ))}
            <button type="button" className="bottom-nav-link bottom-nav-button" onClick={() => setDrawerOpen(true)} aria-label={t('nav.more')}>
              <AppIcon name="menu" size={21} />
              <span>{t('nav.more')}</span>
            </button>
          </nav>
        </div>
      ) : appRoutes}
    </div>
  );
};

export default App;
