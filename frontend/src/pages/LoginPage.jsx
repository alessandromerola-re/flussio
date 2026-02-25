import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import BrandMark from '../components/BrandMark.jsx';

const LoginPage = ({ onLogin, brandLogoUrl }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setToken(data.token, data.role);
      if (!remember) {
        sessionStorage.setItem('flussio_token_temp', data.token);
      }
      onLogin(data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(t, err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container auth-layout">
      <aside className="auth-welcome card">
        <BrandMark logoUrl={brandLogoUrl} alt="Flussio" />
        <h1>{t('pages.login.welcomeTitle')}</h1>
        <p className="muted">{t('pages.login.welcomeText')}</p>
        <div className="auth-chart-card">
          <div className="muted">Overview</div>
          <div className="mini-chart" aria-hidden="true">
            <span className="line blue" />
            <span className="line red" />
          </div>
        </div>
      </aside>

      <form className="card auth-form" onSubmit={handleSubmit}>
        <h1>{t('pages.login.title')}</h1>
        <p className="muted">{t('pages.login.subtitle')}</p>
        <label>
          {t('forms.email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('placeholders.email')}
            required
          />
        </label>
        <label>
          {t('forms.password')}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('placeholders.password')}
            required
          />
        </label>
        <div className="auth-row">
          <label className="checkbox-row">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            {t('forms.rememberMe')}
          </label>
          <button className="link-button" type="button">{t('forms.forgotPassword')}</button>
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading} className="login-submit">
          {loading ? t('common.loading') : t('buttons.login')}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
