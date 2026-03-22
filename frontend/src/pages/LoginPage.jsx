import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, setActiveCompanyId, setToken } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import BrandMark from '../components/BrandMark.jsx';

const LoginPage = ({ onLogin, brandLogoUrl }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setToken(data.token, data.role);
      localStorage.setItem('flussio_companies', JSON.stringify(data.companies || []));
      setActiveCompanyId(data.default_company_id);
      localStorage.setItem('flussio_role', data.role || 'viewer');
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
      <aside className="auth-welcome" aria-label={t('pages.login.welcomeTitle')}>
        <div className="auth-welcome-panel card">
          <div className="auth-brand-lockup">
            <BrandMark logoUrl={brandLogoUrl} alt="Flussio" />
            <span className="auth-badge">{t('pages.login.protectedBadge')}</span>
          </div>
          <div className="auth-welcome-copy">
            <h1>{t('pages.login.welcomeTitle')}</h1>
            <p className="muted auth-welcome-text">{t('pages.login.welcomeText')}</p>
            <p className="auth-support-copy">{t('pages.login.supportText')}</p>
          </div>
          <div className="auth-insight-card" aria-hidden="true">
            <div className="auth-insight-pill">{t('pages.login.insightLabel')}</div>
            <div className="auth-insight-metric">24/7</div>
            <p>{t('pages.login.insightText')}</p>
            <div className="auth-insight-lines">
              <span className="line blue" />
              <span className="line slate" />
            </div>
          </div>
        </div>
      </aside>

      <div className="auth-form-column">
        <form className="card auth-form" onSubmit={handleSubmit} aria-busy={loading}>
          <div className="auth-form-header">
            <h2>{t('pages.login.title')}</h2>
            <p className="muted">{t('pages.login.subtitle')}</p>
          </div>

          <div className="auth-divider" aria-hidden="true" />

          <label>
            {t('forms.email')}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('placeholders.email')}
              autoComplete="email"
              required
            />
          </label>

          <label>
            {t('forms.password')}
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('placeholders.password')}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t('forms.hidePassword') : t('forms.showPassword')}
                aria-pressed={showPassword}
              >
                {showPassword ? t('forms.hidePassword') : t('forms.showPassword')}
              </button>
            </div>
          </label>

          <div className="auth-row">
            <label className="checkbox-row">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>{t('forms.rememberMe')}</span>
            </label>
            <button className="link-button" type="button">{t('forms.forgotPassword')}</button>
          </div>

          {error && <div className="error auth-error" role="alert">{error}</div>}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? t('common.loading') : t('buttons.login')}
          </button>

          <div className="auth-helper-card">
            <strong>{t('pages.login.firstAccessTitle')}</strong>
            <p>{t('pages.login.firstAccessText')}</p>
          </div>
        </form>

        <div className="auth-footer-links" aria-label={t('pages.login.footerLabel')}>
          <button type="button" className="link-button subtle">{t('pages.login.privacy')}</button>
          <span aria-hidden="true">•</span>
          <button type="button" className="link-button subtle">{t('pages.login.support')}</button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
