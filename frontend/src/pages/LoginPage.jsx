import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../services/api.js';

const LoginPage = ({ onLogin }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setToken(data.token, data.role);
      onLogin(data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.code ? t(`errors.${err.code}`) : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="card" onSubmit={handleSubmit}>
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
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? t('common.loading') : t('buttons.login')}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
