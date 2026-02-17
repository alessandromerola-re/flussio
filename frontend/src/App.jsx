import { useMemo, useState } from 'react';
import { Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import routes from './routes.jsx';
import { can, clearToken, getToken } from './services/api.js';
import { setLanguage } from './i18n/index.js';

const App = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token, setTokenState] = useState(getToken());
  const [language, setLanguageState] = useState(() => localStorage.getItem('flussio_lang') || 'it');

  const handleLogout = () => {
    clearToken();
    setTokenState(null);
    navigate('/login');
  };

  const navItems = useMemo(
    () => [
      { path: '/dashboard', label: t('nav.dashboard') },
      { path: '/movements', label: t('nav.movements') },
      { path: '/registry', label: t('nav.registry') },
      { path: '/recurring', label: t('nav.recurring') },
      ...(can('manage_users') ? [{ path: '/users', label: t('nav.users') }] : []),
      ...(can('read', 'roadmap') ? [{ path: '/roadmap', label: t('nav.roadmap') }] : []),
    ],
    [t]
  );

  const handleLanguageChange = (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  };

  return (
    <div className="app">
      {token && (
        <header className="topbar">
          <div className="brand">Flussio</div>

          <nav className="nav">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path} className="nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="actions">
            <label>
              {t('common.language')}{' '}
              <select value={language} onChange={handleLanguageChange}>
                <option value="it">IT</option>
                <option value="en">EN</option>
              </select>
            </label>

            <button type="button" onClick={handleLogout}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
      )}

      <Routes>
        {routes({ setTokenState, token }).map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
    </div>
  );
};

export default App;
