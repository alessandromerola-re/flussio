import { useMemo, useState } from 'react';
import { Route, Routes, Link, useNavigate } from 'react-router-dom';
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
      { path: '/registry', label: t('nav.registry') },
    ],
    [t]
  );

  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
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
              <select value={i18n.resolvedLanguage || 'it'} onChange={handleLanguageChange}>
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
