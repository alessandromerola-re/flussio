import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import routes from './routes.jsx';
import { api, clearToken, getToken } from './services/api.js';
import { can } from './utils/permissions.js';
import { setLanguage } from './i18n/index.js';

const App = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token, setTokenState] = useState(getToken());
  const [language, setLanguageState] = useState(() => localStorage.getItem('flussio_lang') || 'it');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brandLogoUrl, setBrandLogoUrl] = useState('');

  const loadBrandingLogo = async () => {
    if (!getToken()) {
      setBrandLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }

    try {
      const branding = await api.getBranding();
      if (!branding?.has_logo) {
        setBrandLogoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return '';
        });
        return;
      }

      const blob = await api.downloadBrandLogo();
      setBrandLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setBrandLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    }
  };

  useEffect(() => {
    loadBrandingLogo();
    return () => {
      if (brandLogoUrl) URL.revokeObjectURL(brandLogoUrl);
    };
  }, [token]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previous || '';
    }

    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const handleLogout = () => {
    clearToken();
    setTokenState(null);
    setDrawerOpen(false);
    navigate('/login');
  };

  const navItems = useMemo(
    () => [
      { path: '/dashboard', label: t('nav.dashboard') },
      { path: '/movements', label: t('nav.movements') },
      { path: '/registry', label: t('nav.registry') },
      { path: '/recurring', label: t('nav.recurring') },
      ...(can('manage_users') ? [{ path: '/users', label: t('nav.users') }] : []),
      ...(can('manage_users') ? [{ path: '/settings', label: t('nav.settings') }] : []),
      ...(can('read', 'roadmap') ? [{ path: '/roadmap', label: t('nav.roadmap') }] : []),
    ],
    [t]
  );

  const handleLanguageChange = (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  };

  const brandNode = brandLogoUrl ? <img src={brandLogoUrl} className="brand-logo" alt="Logo azienda" /> : <span className="brand-text">Flussio</span>;

  return (
    <div className="app">
      {token ? (
        <div className="shell">
          <aside className="sidebar">
            <Link to="/dashboard" className="sidebar-brand">
              {brandNode}
            </Link>
            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`.trim()}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-footer">
              <label>
                {t('common.language')}
                <select value={language} onChange={handleLanguageChange}>
                  <option value="it">IT</option>
                  <option value="en">EN</option>
                </select>
              </label>
              <button type="button" onClick={handleLogout}>{t('nav.logout')}</button>
            </div>
          </aside>

          <div className="mobile-topbar">
            <button type="button" className="ghost hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">☰</button>
            <Link to="/dashboard" className="sidebar-brand">{brandNode}</Link>
            <div />
          </div>

          {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}
          <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
            <div className="sidebar-brand" style={{ marginBottom: '1rem' }}>{brandNode}</div>
            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`.trim()}
                  onClick={() => setDrawerOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-footer">
              <label>
                {t('common.language')}
                <select value={language} onChange={handleLanguageChange}>
                  <option value="it">IT</option>
                  <option value="en">EN</option>
                </select>
              </label>
              <button type="button" onClick={handleLogout}>{t('nav.logout')}</button>
            </div>
          </aside>

          <main className="content">
            <Routes>
              {routes({ setTokenState, token, onBrandingChanged: loadBrandingLogo }).map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
            </Routes>
          </main>
        </div>
      ) : (
        <Routes>
          {routes({ setTokenState, token, onBrandingChanged: loadBrandingLogo }).map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      )}
    </div>
  );
};

export default App;
