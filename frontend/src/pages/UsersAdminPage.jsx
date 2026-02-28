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
  const [modalOpen, setModalOpen] = useState(false);

  // Backward-compatibility guard: older cached bundles referenced a company-creation
  // handler in this page. Company creation now lives only in Settings (Super Admin).
  // Keeping this no-op prevents runtime crashes if stale JSX is still served.
  const handleCreateCompany = (event) => {
    event?.preventDefault?.();
  };

  const loadUsers = async () => {
    if (!canPermission('users_manage')) return;
    setUsers(await api.getUsers());
  };

  useEffect(() => {
    loadUsers().catch(() => setMessage(getErrorMessage(t, null)));
  }, []);

  if (!canPermission('users_manage')) {
    return <div className="page"><div className="error">{t('errors.FORBIDDEN')}</div></div>;
  }

  const closeModal = () => {
    setForm(initialForm);
    setModalOpen(false);
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      await api.createUser({
        email: form.email,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      });
      closeModal();
      await loadUsers();
      setMessage('Membro aggiornato con successo.');
    } catch (error) {
      setMessage(getErrorMessage(t, error));
    }
  };

  const handleToggleMembership = async (user) => {
    setMessage('');
    try {
      await api.updateUser(user.id, { membership_active: !user.membership_active });
      await loadUsers();
    } catch (error) {
      setMessage(getErrorMessage(t, error));
    }
  };

  return (
    <div className="page users-page">
      <div className="page-header users-page-header">
        <h1>{t('pages.users.title')}</h1>
        <button type="button" className="primary users-new-desktop" onClick={() => setModalOpen(true)}>
          {t('buttons.new')}
        </button>
      </div>

      {message && <div className="muted users-feedback">{message}</div>}

      <div className="card users-card">
        <div className="users-table-head">
          <span>{t('forms.email')}</span>
          <span>{t('forms.role')}</span>
          <span>{t('forms.status')}</span>
          <span>{t('forms.actions')}</span>
        </div>

        <ul className="users-list">
          {users.map((user) => (
            <li key={user.id} className="users-row">
              <div className="users-cell users-email">
                <strong>{user.email}</strong>
              </div>

              <div className="users-cell">
                <span className="muted">{user.role}</span>
              </div>

              <div className="users-cell">
                <span className={`users-status-pill ${user.membership_active ? 'active' : 'inactive'}`}>
                  {user.membership_active ? 'active' : 'inactive'}
                </span>
              </div>

              <div className="users-cell users-actions">
                <button
                  type="button"
                  className="ghost users-action-btn"
                  onClick={() => handleToggleMembership(user)}
                >
                  {user.membership_active ? t('buttons.deactivate') : t('buttons.activate')}
                </button>

                <button
                  type="button"
                  className="ghost users-action-btn"
                  onClick={async () => {
                    const out = await api.createResetToken(user.id);
                    setMessage(out.token ? `${t('pages.users.resetToken')}: ${out.token}` : t('pages.users.resetByEmail'));
                  }}
                >
                  {t('pages.users.generateReset')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal}>
        <div className="modal-content">
          <form onSubmit={submitCreate} className="users-create-form">
            <h2>Aggiungi membro</h2>
            <label>
              {t('forms.email')}
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>

            <label>
              {t('forms.password')} (opzionale per utente esistente)
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>

            <label>
              {t('forms.role')}
              <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="admin">admin</option>
                <option value="editor">editor</option>
                <option value="operatore">operatore</option>
                <option value="viewer">viewer</option>
              </select>
            </label>

            <div className="modal-actions">
              <button type="submit">{t('buttons.save')}</button>
              <button type="button" className="ghost" onClick={closeModal}>{t('buttons.close')}</button>
            </div>
          </form>
        </div>
      </Modal>

      <FloatingAddButton onClick={() => setModalOpen(true)} ariaLabel={t('buttons.new')} />
    </div>
  );
};

export default UsersAdminPage;
