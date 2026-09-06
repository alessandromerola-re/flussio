import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const originalAccess = useRef([]);
  const [resetResult, setResetResult] = useState(null);
  const [showToken, setShowToken] = useState(false);


  const isSuperAdmin = getIsSuperAdmin();
  const activeCompanyId = Number(getActiveCompanyId());

  const availableCompanies = useMemo(() => {
    if (isSuperAdmin) return companies;
    return companies.filter((company) => Number(company.id) === activeCompanyId);
  }, [companies, isSuperAdmin, activeCompanyId]);

  const loadUsers = async () => {
    if (!mounted.current || !canPermission('users_manage')) return;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const [list, companyList] = await Promise.all([
        api.getUsers(),
        isSuperAdmin ? api.getCompanies() : Promise.resolve(JSON.parse(localStorage.getItem('flussio_companies') || '[]')),
      ]);
      if (current !== generation.current) return;
      setUsers(list);
      setCompanies(companyList || []);
    } catch (loadError) {
      if (current === generation.current) setError(getErrorMessage(t, loadError));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    loadUsers();
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  const runAction = async (action) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); }
    catch (actionError) { if (mounted.current) setError(getErrorMessage(t, actionError)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };

  const unusedCompanies = availableCompanies.filter((company) => !form.memberships.some((membership) => Number(membership.company_id) === Number(company.id)));

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
    if (busy || loading || error) return;
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
      if (!mounted.current) return;
      const memberships = (detail.memberships || []).map((membership) => ({
        company_id: String(membership.company_id),
        role: membership.role,
        is_active: membership.is_active !== false,
      }));

      originalAccess.current = memberships;
      setForm({
        id: detail.id,
        email: detail.email,
        password: '',
        is_active: detail.is_active !== false,
        memberships: memberships.length > 0 ? memberships : [{ ...emptyMembership, company_id: activeCompanyId || '' }],
      });
      setModalOpen(true);
    } catch (error) {
      setError(getErrorMessage(t, error));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');

    const memberships = toPayloadMemberships();
    if (memberships.length === 0) {
      setError(t('errors.VALIDATION_MISSING_FIELDS'));
      return;
    }

    if (form.id && isSuperAdmin && !form.is_active && !window.confirm(t('adminUx.globalDisableConfirm'))) return;
    const removesAccess = form.id && originalAccess.current.some((old) => old.is_active && !memberships.some((next) => Number(next.company_id) === Number(old.company_id) && next.is_active));
    if (removesAccess && !window.confirm(t('adminUx.accessChangesConfirm'))) return;

    try {
      if (form.id) {
        await api.updateUser(form.id, isSuperAdmin
          ? { email: form.email, is_active: form.is_active, memberships }
          : { memberships });
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
      setError(getErrorMessage(t, error));
    }
  };

  const handleToggleMembership = async (user) => {
    if (user.membership_active && !window.confirm(t('adminUx.disableAccessConfirm', { email: user.email }))) return;
    setMessage('');
    try {
      await api.updateUser(user.id, { membership_active: !user.membership_active });
      await loadUsers();
    } catch (error) {
      setError(getErrorMessage(t, error));
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
    const fallbackCompanyId = unusedCompanies[0]?.id;
    if (!fallbackCompanyId) return;
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
        <button type="button" className="primary users-new-desktop" onClick={openCreate} disabled={busy || loading || Boolean(error)}>
          {t('buttons.new')}
        </button>
      </div>

      <p className="muted">{t('adminUx.membershipHint')}</p>
      {message && <div className="success users-feedback" role="status">{message}</div>}
      {error && !modalOpen && <div className="error" role="alert">{error} <button type="button" onClick={loadUsers} disabled={busy || loading}>{t('buttons.retry')}</button></div>}
      {loading && <p role="status">{t('common.loading')}</p>}

      <fieldset className="admin-fieldset" disabled={busy || loading}>
      <div className="card users-card">
        {!loading && !error && users.length === 0 && <p>{t('adminUx.noUsers')}</p>}
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
                <span>{t(`adminUx.roles.${user.role}`)}</span>
                <small className="muted">{t(`adminUx.roleHints.${user.role}`)}</small>
              </div>

              <div className="users-cell">
                <span className={`users-status-pill ${user.membership_active ? 'active' : 'inactive'}`}>
                  {t(user.membership_active ? 'adminUx.accessActive' : 'adminUx.accessInactive')}
                </span>
                {user.is_active === false && <small className="error">{t('adminUx.globalInactive')}</small>}
              </div>

              <div className="users-cell users-actions">
                <button
                  type="button"
                  className="ghost users-action-btn"
                  onClick={() => runAction(() => openEdit(user.id))}
                >
                  {t('buttons.edit')}
                </button>

                <button
                  type="button"
                  className="ghost users-action-btn"
                  onClick={() => runAction(() => handleToggleMembership(user))}
                >
                  {user.membership_active ? t('buttons.deactivate') : t('buttons.activate')}
                </button>

                <button
                  type="button"
                  className="ghost users-action-btn"
                  onClick={() => runAction(async () => {
                    if (!window.confirm(t('adminUx.resetConfirm', { email: user.email }))) return;
                    const out = await api.createResetToken(user.id);
                    if (!mounted.current) return;
                    setShowToken(false);
                    setResetResult({ ...out, email: user.email });
                  })}
                >
                  {t('pages.users.generateReset')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      </fieldset>

      <Modal isOpen={modalOpen} dismissible={!busy} onClose={closeModal}>
        <div>
          <form onSubmit={(event) => { event.preventDefault(); runAction(() => submit(event)); }} className="users-create-form">
            <fieldset className="admin-fieldset" disabled={busy}>
            <h2>{form.id ? t('pages.users.editUser') : t('pages.users.addUser')}</h2>
            {error && <div className="error" role="alert">{error}</div>}
            <label>
              {t('forms.email')}
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                disabled={Boolean(form.id) && !isSuperAdmin}
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

            {form.id && isSuperAdmin && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                {t('adminUx.globalActive')}
              </label>
            )}

            <h3>{t('pages.users.companyAccess')}</h3>
            {form.memberships.map((membership, index) => (
              <div key={index} className="admin-membership">
                <select
                  aria-label={`${t('pages.users.selectCompany')} ${index + 1}`}
                  value={membership.company_id}
                  onChange={(event) => setMembershipAt(index, 'company_id', event.target.value)}
                  disabled={!isSuperAdmin}
                  required
                >
                  <option value="">{t('pages.users.selectCompany')}</option>
                  {availableCompanies.map((company) => (
                    <option key={company.id} value={company.id} disabled={form.memberships.some((other, otherIndex) => otherIndex !== index && Number(other.company_id) === Number(company.id))}>{company.name}</option>
                  ))}
                </select>

                <select
                  aria-label={`${t('forms.role')} ${index + 1}`}
                  value={membership.role}
                  onChange={(event) => setMembershipAt(index, 'role', event.target.value)}
                >
                  {['admin', 'editor', 'operatore', 'viewer'].map((role) => <option key={role} value={role}>{t(`adminUx.roles.${role}`)}</option>)}
                </select>
                <small className="muted">{t(`adminUx.roleHints.${membership.role}`)}</small>

                <label className="checkbox-row" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={membership.is_active}
                    onChange={(event) => setMembershipAt(index, 'is_active', event.target.checked)}
                  />
                  {t('adminUx.accessActive')}
                </label>

                {isSuperAdmin && form.memberships.length > 1 && (
                  <button type="button" className="ghost" onClick={() => removeMembership(index)}>
                    {t('buttons.remove')}
                  </button>
                )}
              </div>
            ))}

            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              {isSuperAdmin && unusedCompanies.length > 0
                ? <button type="button" className="ghost" onClick={addMembership}>{t('pages.users.addCompanyAccess')}</button>
                : <span />}
              <div>
                <button type="submit">{t('buttons.save')}</button>
                <button type="button" className="ghost" onClick={closeModal}>{t('buttons.close')}</button>
              </div>
            </div>
            </fieldset>
          </form>
        </div>
      </Modal>

      <Modal isOpen={Boolean(resetResult)} onClose={() => { setResetResult(null); setShowToken(false); }}>
        {resetResult && <div className="admin-reset">
          <h2>{t('pages.users.generateReset')}</h2>
          <p>{resetResult.email}</p>
          <p className="warning">{t(resetResult.token ? 'adminUx.resetPrivate' : 'adminUx.resetDeliveryUnconfirmed')}</p>
          {resetResult.token && <label>{t('pages.users.resetToken')}
            <input type={showToken ? 'text' : 'password'} value={resetResult.token} readOnly autoComplete="off" />
          </label>}
          {resetResult.expires_at && <p>{t('adminUx.expiresAt')}: {new Date(resetResult.expires_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</p>}
          {resetResult.token && <button type="button" onClick={() => setShowToken(!showToken)}>{t(showToken ? 'adminUx.hideToken' : 'adminUx.showToken')}</button>}
          <button type="button" className="ghost" onClick={() => { setResetResult(null); setShowToken(false); }}>{t('buttons.close')}</button>
        </div>}
      </Modal>

      {!busy && !loading && !error && <FloatingAddButton onClick={openCreate} ariaLabel={t('buttons.new')} />}
    </div>
  );
};

export default UsersAdminPage;
