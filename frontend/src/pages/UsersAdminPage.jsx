import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, canPermission } from '../services/api.js';

const initialForm = { email: '', password: '', role: 'viewer' };

const UsersAdminPage = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    if (!canPermission('users_manage')) return;
    setUsers(await api.getUsers());
  };

  useEffect(() => {
    loadUsers().catch(() => setMessage(t('errors.SERVER_ERROR')));
  }, []);

  if (!canPermission('users_manage')) {
    return <div className="page"><div className="error">{t('errors.FORBIDDEN')}</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header"><h1>{t('pages.users.title')}</h1></div>
      {message && <div className="muted">{message}</div>}
      <div className="grid-two">
        <form className="card" onSubmit={async (e) => {
          e.preventDefault();
          await api.createUser(form);
          setForm(initialForm);
          await loadUsers();
        }}>
          <label>{t('forms.email')}<input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required /></label>
          <label>{t('forms.password')}<input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} required /></label>
          <label>{t('forms.role')}<select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}><option value="admin">admin</option><option value="editor">editor</option><option value="operatore">operatore</option><option value="viewer">viewer</option></select></label>
          <button type="submit">{t('buttons.save')}</button>
        </form>
        <div className="card">
          <ul className="list">
            {users.map((u) => (
              <li key={u.id} className="list-item-row">
                <div>
                  <strong>{u.email}</strong>
                  <div className="muted">{u.role} · {u.is_active ? 'active' : 'inactive'}</div>
                </div>
                <div className="row-actions">
                  <button type="button" className="ghost" onClick={async () => {
                    await api.updateUser(u.id, { is_active: !u.is_active });
                    await loadUsers();
                  }}>{u.is_active ? t('buttons.deactivate') : t('buttons.activate')}</button>
                  <button type="button" className="ghost" onClick={async () => {
                    const out = await api.createResetToken(u.id);
                    setMessage(out.token ? `${t('pages.users.resetToken')}: ${out.token}` : t('pages.users.resetByEmail'));
                  }}>{t('pages.users.generateReset')}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UsersAdminPage;
