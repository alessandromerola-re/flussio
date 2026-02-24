import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import Modal from '../components/Modal.jsx';
import FloatingAddButton from '../components/FloatingAddButton.jsx';

const initialForm = { email: '', password: '', role: 'viewer' };

const UsersAdminPage = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const loadUsers = async () => {
    if (!canPermission('users_manage')) return;
    setUsers(await api.getUsers());
  };

  useEffect(() => {
    loadUsers().catch(() => setMessage(getErrorMessage(t, null)));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await api.createUser(form);
    setForm(initialForm);
    setCreateOpen(false);
    await loadUsers();
  };

  if (!canPermission('users_manage')) {
    return <div className="page"><div className="error">{t('errors.FORBIDDEN')}</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.users.title')}</h1>
        <button type="button" className="desktop-only" onClick={() => setCreateOpen(true)}>{t('buttons.new')}</button>
      </div>
      {message && <div className="muted">{message}</div>}

      <div className="card">
        <table className="clean-table">
          <thead>
            <tr>
              <th>{t('forms.email')}</th>
              <th>{t('forms.role')}</th>
              <th>{t('pages.users.status')}</th>
              <th>{t('pages.users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td><span className={u.is_active ? 'positive' : 'muted'}>{u.is_active ? 'active' : 'inactive'}</span></td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="ghost" onClick={async () => {
                      await api.createResetToken(u.id);
                      setMessage(t('pages.users.resetByEmail'));
                    }}>Reset</button>
                    <button type="button" className="ghost" onClick={async () => {
                      await api.updateUser(u.id, { is_active: !u.is_active });
                      await loadUsers();
                    }}>{u.is_active ? t('buttons.deactivate') : t('buttons.activate')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="modal-content">
          <form onSubmit={handleCreate}>
            <h2>{t('buttons.new')}</h2>
            <label>{t('forms.email')}<input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required /></label>
            <label>{t('forms.password')}<input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} required /></label>
            <label>{t('forms.role')}<select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}><option value="admin">admin</option><option value="editor">editor</option><option value="operatore">operatore</option><option value="viewer">viewer</option></select></label>
            <div className="modal-actions"><button type="submit">{t('buttons.save')}</button></div>
          </form>
        </div>
      </Modal>

      <FloatingAddButton onClick={() => setCreateOpen(true)} label={t('buttons.new')} />
    </div>
  );
};

export default UsersAdminPage;
