import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import routes from './routes.jsx';
import { clearToken, getToken } from './services/api.js';
import { setLanguage } from './i18n/index.js';

const App = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [token, setTokenState] = useState(getToken());

  const handleLogout = () => {
    clearToken();
    setTokenState(null);
    navigate('/login');
  };

  const navItems = useMemo(
    () => [
      { path: '/dashboard', label: t('nav.dashboard') },
      { path: '/movements', label: t('nav.movements') },
      { path: '/registry', label: t('nav.registry') }
    ],
    [t]
  );

  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
  };

  return (
    <div className="app">
      {token && (
        <header className="app-header">
          <div className="brand">Flussio</div>
          <nav className="nav-links">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <label htmlFor="language" className="sr-only">
              {t('common.language')}
            </label>
            <select id="language" value={i18n.language} onChange={handleLanguageChange}>
              <option value="it">IT</option>
              <option value="en">EN</option>
            </select>
            <button type="button" className="ghost" onClick={handleLogout}>
              {t('nav.logout')}
            </button>
          </div>
        </header>
      )}
      <main className={token ? 'app-main' : 'app-main full'}>
        <Routes>
          {routes({ setTokenState, token }).map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to={token ? '/dashboard' : '/login'} />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
