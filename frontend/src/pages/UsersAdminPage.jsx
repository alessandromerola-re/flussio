import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getActiveCompanyId, getIsSuperAdmin } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import Modal from '../components/Modal.jsx';
import FloatingAddButton from '../components/FloatingAddButton.jsx';

const emptyMembership = { company_id: '', role: 'viewer', is_active: true };
const initialForm = { id: null, email: '', password: '', is_active: true, memberships: [emptyMembership] };

const UsersAdminPage = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [companies, setCompanies] = useState([]);

  // Backward compatibility guard: older cached bundles referenced this handler
  // while company creation has been moved to Settings page only.
  const handleCreateCompany = (event) => {
    event?.preventDefault?.();
  };

  const isSuperAdmin = getIsSuperAdmin();
  const activeCompanyId = Number(getActiveCompanyId());

  const availableCompanies = useMemo(() => {
    if (isSuperAdmin) return companies;
    return companies.filter((company) => Number(company.id) === activeCompanyId);
  }, [companies, isSuperAdmin, activeCompanyId]);

  const loadUsers = async () => {
    if (!canPermission('users_manage')) return;
    setUsers(await api.getUsers());
  };

  const loadCompanies = async () => {
    if (isSuperAdmin) {
      setCompanies(await api.getCompanies());
      return;
    }

    const localCompanies = JSON.parse(localStorage.getItem('flussio_companies') || '[]');
    setCompanies(localCompanies || []);
  };

  useEffect(() => {
    loadUsers().catch(() => setMessage(getErrorMessage(t, null)));
    loadCompanies().catch(() => setMessage(getErrorMessage(t, null)));
  }, []);

  if (!canPermission('users_manage')) {
    return <div className="page"><div className="error">{t('errors.FORBIDDEN')}</div></div>;
  }

  const closeModal = () => {
    setForm(initialForm);
    setModalOpen(false);
  };

  const toPayloadMemberships = () => form.memberships
    .filter((membership) => membership.company_id)
    .map((membership) => ({
      company_id: Number(membership.company_id),
      role: membership.role,
      is_active: membership.is_active,
    }));

  const openCreate = () => {
    const defaultCompanyId = activeCompanyId || availableCompanies[0]?.id || '';
    setForm({
      ...initialForm,
      memberships: [{ ...emptyMembership, company_id: defaultCompanyId }],
    });
    setModalOpen(true);
  };

  const openEdit = async (userId) => {
    setMessage('');
    try {
      const detail = await api.getUser(userId);
      const memberships = (detail.memberships || []).map((membership) => ({
        company_id: String(membership.company_id),
        role: membership.role,
        is_active: membership.is_active !== false,
      }));

      setForm({
        id: detail.id,
        email: detail.email,
        password: '',
        is_active: detail.is_active !== false,
        memberships: memberships.length > 0 ? memberships : [{ ...emptyMembership, company_id: activeCompanyId || '' }],
      });
      setModalOpen(true);
    } catch (error) {
      setMessage(getErrorMessage(t, error));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');

    const memberships = toPayloadMemberships();
    if (memberships.length === 0) {
      setMessage(t('errors.VALIDATION_MISSING_FIELDS'));
      return;
    }

    try {
      if (form.id) {
        await api.updateUser(form.id, {
          email: form.email,
          is_active: form.is_active,
          memberships,
        });
        setMessage(t('pages.users.updated'));
      } else {
        await api.createUser({
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
          memberships,
        });
        setMessage(t('pages.users.created'));
      }

      closeModal();
      await loadUsers();
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

  const setMembershipAt = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.memberships];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, memberships: next };
    });
  };

  const addMembership = () => {
    const fallbackCompanyId = activeCompanyId || availableCompanies[0]?.id || '';
    setForm((prev) => ({
      ...prev,
      memberships: [...prev.memberships, { ...emptyMembership, company_id: fallbackCompanyId }],
    }));
  };

  const removeMembership = (index) => {
    setForm((prev) => ({
      ...prev,
      memberships: prev.memberships.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  return (
    <div className="page users-page">
      <div className="page-header users-page-header">
        <h1>{t('pages.users.title')}</h1>
        <button type="button" className="primary users-new-desktop" onClick={openCreate}>
          {t('buttons.new')}
        </button>
      </div>

      {message && <div className="muted users-feedback">{message}</div>}

      <div className="card users-card">
        <div className="users-table-head">
          <span>{t('forms.email')}</span>
          <span>{t('forms.role')}</span>
          <span>{t('pages.users.status')}</span>
          <span>{t('pages.users.actions')}</span>
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
                  onClick={() => openEdit(user.id)}
                >
                  {t('buttons.edit')}
                </button>

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
          <form onSubmit={submit} className="users-create-form">
            <h2>{form.id ? t('pages.users.editUser') : t('pages.users.addUser')}</h2>
            <label>
              {t('forms.email')}
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>

            {!form.id && (
              <label>
                {t('forms.password')}
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
            )}

            {form.id && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                {t('forms.active')}
              </label>
            )}

            <h3>{t('pages.users.companyAccess')}</h3>
            {form.memberships.map((membership, index) => (
              <div key={`${membership.company_id}-${index}`} className="row-actions" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
                <select
                  value={membership.company_id}
                  onChange={(event) => setMembershipAt(index, 'company_id', event.target.value)}
                  required
                >
                  <option value="">{t('pages.users.selectCompany')}</option>
                  {availableCompanies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>

                <select
                  value={membership.role}
                  onChange={(event) => setMembershipAt(index, 'role', event.target.value)}
                >
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="operatore">operatore</option>
                  <option value="viewer">viewer</option>
                </select>

                <label className="checkbox-row" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={membership.is_active}
                    onChange={(event) => setMembershipAt(index, 'is_active', event.target.checked)}
                  />
                  {t('forms.active')}
                </label>

                {form.memberships.length > 1 && (
                  <button type="button" className="ghost" onClick={() => removeMembership(index)}>
                    {t('buttons.remove')}
                  </button>
                )}
              </div>
            ))}

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="ghost" onClick={addMembership}>{t('pages.users.addCompanyAccess')}</button>
              <div>
                <button type="submit">{t('buttons.save')}</button>
                <button type="button" className="ghost" onClick={closeModal}>{t('buttons.close')}</button>
              </div>
            </div>
          </form>
        </div>
      </Modal>

      <FloatingAddButton onClick={openCreate} ariaLabel={t('buttons.new')} />
    </div>
  );
};

export default UsersAdminPage;
