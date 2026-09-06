import { useEffect, useId, useRef, useState } from 'react';
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
  const passwordId = useId();
  const loginLock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loginLock.current) return;
    const current = generation.current;
    loginLock.current = true;
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email: email.trim(), password, remember });
      if (current !== generation.current) return;
      setToken(data.token, data.role, remember);
      localStorage.setItem('flussio_companies', JSON.stringify(data.companies || []));
      setActiveCompanyId(data.default_company_id);
      onLogin(data.token);
      navigate('/dashboard');
    } catch (err) {
      if (current === generation.current) setError(getErrorMessage(t, err));
    } finally {
      loginLock.current = false;
      if (current === generation.current) setLoading(false);
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
          <div className="auth-mobile-brand">
            <BrandMark logoUrl={brandLogoUrl} alt="Flussio" />
            <span className="auth-badge">{t('pages.login.protectedBadge')}</span>
          </div>
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
              name="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
              required
            />
          </label>

          <div className="auth-password-group">
            <label htmlFor={passwordId}>{t('forms.password')}</label>
            <div className="password-field">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('placeholders.password')}
                autoComplete="current-password"
                disabled={loading}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t('forms.hidePassword') : t('forms.showPassword')}
                aria-pressed={showPassword}
                aria-controls={passwordId}
                title={showPassword ? t('forms.hidePassword') : t('forms.showPassword')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
          </div>

          <div className="auth-row">
            <label className="checkbox-row">
              <input type="checkbox" checked={remember} disabled={loading} onChange={(event) => setRemember(event.target.checked)} />
              <span>{t('forms.rememberMe')}</span>
            </label>
          </div>

          {error && <div className="error auth-error" role="alert">{error}</div>}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? t('common.loading') : t('buttons.login')}
          </button>

          <details className="auth-helper-card">
            <summary>{t('pages.login.firstAccessTitle')}</summary>
            <p>{t('pages.login.firstAccessText')}</p>
          </details>
        </form>

      </div>
    </div>
  );
};

export default LoginPage;
