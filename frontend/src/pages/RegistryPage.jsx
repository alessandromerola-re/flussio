import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import Modal from '../components/Modal.jsx';

const initialAccount = { name: '', type: 'cash', opening_balance: 0, is_active: true };
const initialCategory = {
  name: '',
  direction: 'income',
  parent_id: '',
  color: '#2ecc71',
  is_active: true,
};
const initialContact = {
  name: '',
  email: '',
  phone: '',
  default_category_id: '',
  is_active: true,
};
const initialProperty = { name: '', notes: '', contact_id: '', is_active: true };
const initialJob = {
  code: '',
  title: '',
  notes: '',
  contact_id: '',
  is_closed: false,
  is_active: true,
  budget: '',
  start_date: '',
  end_date: '',
};

const RegistryPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState('jobs');
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [accountForm, setAccountForm] = useState(initialAccount);
  const [categoryForm, setCategoryForm] = useState(initialCategory);
  const [contactForm, setContactForm] = useState(initialContact);
  const [propertyForm, setPropertyForm] = useState(initialProperty);
  const [jobForm, setJobForm] = useState(initialJob);
  const [editingId, setEditingId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [jobFormError, setJobFormError] = useState('');
  const [createModalTab, setCreateModalTab] = useState('');

  const loadData = async () => {
    setLoadError('');
    const results = await Promise.allSettled([
      api.getAccounts(),
      api.getCategories(),
      api.getContacts(),
      api.getProperties(),
      api.getJobs({ active: 0, include_closed: 1 }),
    ]);
    const [accountsResult, categoriesResult, contactsResult, propertiesResult, jobsResult] = results;

    if (accountsResult.status === 'fulfilled') {
      setAccounts(accountsResult.value);
    }
    if (categoriesResult.status === 'fulfilled') {
      setCategories(categoriesResult.value);
    }
    if (contactsResult.status === 'fulfilled') {
      setContacts(contactsResult.value);
    }
    if (propertiesResult.status === 'fulfilled') {
      setProperties(propertiesResult.value);
    }
    if (jobsResult.status === 'fulfilled') {
      setJobs(jobsResult.value);
    }

    if (results.some((result) => result.status === 'rejected')) {
      setLoadError(getErrorMessage(t, null));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const groupedCategories = useMemo(() => {
    const parents = categories.filter((cat) => !cat.parent_id);
    const children = categories.filter((cat) => cat.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: children.filter((child) => child.parent_id === parent.id),
    }));
  }, [categories]);

  const categoryParentOptions = useMemo(() => {
    const byId = new Map(categories.map((cat) => [cat.id, cat]));
    const getDepth = (cat) => {
      let depth = 0;
      let cursor = cat;
      while (cursor?.parent_id) {
        cursor = byId.get(cursor.parent_id);
        depth += 1;
        if (depth > 10) break;
      }
      return depth;
    };

    return categories
      .filter((cat) => cat.direction === categoryForm.direction)
      .filter((cat) => (editingId ? String(cat.id) !== String(editingId) : true))
      .map((cat) => ({ ...cat, depth: getDepth(cat) }));
  }, [categories, categoryForm.direction, editingId]);

  const resetForms = () => {
    setAccountForm(initialAccount);
    setCategoryForm(initialCategory);
    setContactForm(initialContact);
    setPropertyForm(initialProperty);
    setJobForm(initialJob);
    setEditingId(null);
    setJobFormError('');
  };

  const handleTabChange = (nextTab) => {
    resetForms();
    setTab(nextTab);
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    if (editingId) {
      await api.updateAccount(editingId, accountForm);
    } else {
      await api.createAccount(accountForm);
    }
    resetForms();
    setAccounts(await api.getAccounts());
  };

  const handleCategorySubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...categoryForm,
      parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
    };
    if (editingId) {
      await api.updateCategory(editingId, payload);
    } else {
      await api.createCategory(payload);
    }
    resetForms();
    setCategories(await api.getCategories());
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...contactForm,
      default_category_id: contactForm.default_category_id
        ? Number(contactForm.default_category_id)
        : null,
    };
    if (editingId) {
      await api.updateContact(editingId, payload);
    } else {
      await api.createContact(payload);
    }
    resetForms();
    setContacts(await api.getContacts());
  };



  const handleJobSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      code: jobForm.code?.trim() || null,
      title: jobForm.title?.trim(),
      notes: jobForm.notes?.trim() || null,
      contact_id: jobForm.contact_id ? Number(jobForm.contact_id) : null,
      is_closed: jobForm.is_closed,
      is_active: jobForm.is_active,
      budget: jobForm.budget === '' ? null : Number(jobForm.budget),
      start_date: jobForm.start_date || null,
      end_date: jobForm.end_date || null,
    };

    try {
      if (editingId) {
        await api.updateJob(editingId, payload);
      } else {
        await api.createJob(payload);
      }

      setJobFormError('');
      resetForms();
      setJobs(await api.getJobs({ active: 0, include_closed: 1 }));
    } catch (submitError) {
      setJobFormError(getErrorMessage(t, submitError));
    }
  };

  const handlePropertySubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...propertyForm,
      contact_id: propertyForm.contact_id ? Number(propertyForm.contact_id) : null,
    };
    if (editingId) {
      await api.updateProperty(editingId, payload);
    } else {
      await api.createProperty(payload);
    }
    resetForms();
    setProperties(await api.getProperties());
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(t('modals.confirmDelete'))) {
      return;
    }
    const actions = {
      accounts: () => api.deleteAccount(id),
      categories: () => api.deleteCategory(id),
      contacts: () => api.deleteContact(id),
      jobs: () => api.deleteJob(id),
      properties: () => api.deleteProperty(id),
    };
    await actions[type]();
    resetForms();
    loadData();
  };

  const openCreateModal = (targetTab) => {
    resetForms();
    setTab(targetTab);
    setCreateModalTab(targetTab);
  };

  const closeCreateModal = () => {
    setCreateModalTab('');
    resetForms();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.registry.title')}</h1>
        {canPermission('write') && (
          <button type="button" onClick={() => openCreateModal(tab)}>
            {t('buttons.new')}
          </button>
        )}
      </div>
      {loadError && <div className="error">{loadError}</div>}
      <div className="tabs">
        <button type="button" className={tab === 'accounts' ? 'active' : ''} onClick={() => handleTabChange('accounts')}>
          {t('pages.registry.accounts')}
        </button>
        <button type="button" className={tab === 'categories' ? 'active' : ''} onClick={() => handleTabChange('categories')}>
          {t('pages.registry.categories')}
        </button>
        <button type="button" className={tab === 'contacts' ? 'active' : ''} onClick={() => handleTabChange('contacts')}>
          {t('pages.registry.contacts')}
        </button>
        <button type="button" className={tab === 'jobs' ? 'active' : ''} onClick={() => handleTabChange('jobs')}>
          {t('pages.registry.jobs')}
        </button>
        <button type="button" className={tab === 'properties' ? 'active' : ''} onClick={() => handleTabChange('properties')}>
          {t('pages.registry.propertiesBeta')}
        </button>
      </div>

      {tab === 'accounts' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleAccountSubmit}>
            <h2>{t('pages.registry.accounts')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={accountForm.name}
                onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.type')}
              <select
                value={accountForm.type}
                onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}
              >
                <option value="cash">{t('labels.cash')}</option>
                <option value="bank">{t('labels.bank')}</option>
                <option value="card">{t('labels.card')}</option>
              </select>
            </label>
            <label>
              {t('forms.openingBalance')}
              <input
                type="number"
                step="0.01"
                value={accountForm.opening_balance}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, opening_balance: event.target.value })
                }
              />
            </label>
            {canPermission('write') && <button type="submit">{t('buttons.save')}</button>}
          </form>
          <div className="card">
            <ul className="list">
              {accounts.map((account) => (
                <li key={account.id} className="list-item-row">
                  <div>
                    <strong>{account.name}</strong>
                    <div className="muted">{t(`labels.${account.type}`)}</div>
                    <div className="muted">{t('forms.openingBalance')}: € {Number(account.opening_balance).toFixed(2)}</div>
                    <div className="muted">{t('forms.currentBalance')}: € {Number(account.balance).toFixed(2)}</div>
                  </div>
                  <div className="row-actions">
                    {canPermission('write') && <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setAccountForm({
                          name: account.name,
                          type: account.type,
                          opening_balance: account.opening_balance,
                          is_active: account.is_active,
                        });
                        setEditingId(account.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>}
                    {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('accounts', account.id)}>
                      {t('buttons.delete')}
                    </button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleCategorySubmit}>
            <h2>{t('pages.registry.categories')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.direction')}
              <select
                value={categoryForm.direction}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, direction: event.target.value, parent_id: '' })
                }
              >
                <option value="income">{t('pages.movements.income')}</option>
                <option value="expense">{t('pages.movements.expense')}</option>
              </select>
            </label>
            <label>
              {t('forms.parentCategory')}
              <select
                value={categoryForm.parent_id}
                onChange={(event) => setCategoryForm({ ...categoryForm, parent_id: event.target.value })}
              >
                <option value="">{t('common.none')}</option>
                {categoryParentOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {`${'— '.repeat(cat.depth)}${cat.name}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('forms.color')}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  value={categoryForm.color || '#2ecc71'}
                  onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
                />
                <span
                  aria-label={t('forms.color')}
                  style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #d1d5db', background: categoryForm.color || '#2ecc71' }}
                />
              </div>
            </label>
            {canPermission('write') && <button type="submit">{t('buttons.save')}</button>}
          </form>
          <div className="card">
            <ul className="list">
              {groupedCategories.map((category) => (
                <li key={category.id}>
                  <div className="list-item-row">
                    <div className="category-label">
                      <span className="dot" style={{ backgroundColor: category.color || '#ccc' }} />
                      <strong>{category.name}</strong>
                    </div>
                    <div className="row-actions">
                      {canPermission('write') && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setCategoryForm({
                              name: category.name,
                              direction: category.direction,
                              parent_id: category.parent_id || '',
                              color: category.color || '#2ecc71',
                              is_active: category.is_active,
                            });
                            setEditingId(category.id);
                          }}
                        >
                          {t('buttons.edit')}
                        </button>
                      )}
                      {canPermission('delete_sensitive') && (
                        <button type="button" className="danger" onClick={() => handleDelete('categories', category.id)}>
                          {t('buttons.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                  {category.children.length > 0 && (
                    <ul className="sub-list">
                      {category.children.map((child) => (
                        <li key={child.id} className="list-item-row">
                          <div className="category-label indent">
                            <span className="dot" style={{ backgroundColor: child.color || '#ccc' }} />
                            {child.name}
                          </div>
                          <div className="row-actions">
                            {canPermission('write') && (
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  setCategoryForm({
                                    name: child.name,
                                    direction: child.direction,
                                    parent_id: child.parent_id || '',
                                    color: child.color || '#2ecc71',
                                    is_active: child.is_active,
                                  });
                                  setEditingId(child.id);
                                }}
                              >
                                {t('buttons.edit')}
                              </button>
                            )}
                            {canPermission('delete_sensitive') && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() => handleDelete('categories', child.id)}
                              >
                                {t('buttons.delete')}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleContactSubmit}>
            <h2>{t('pages.registry.contacts')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={contactForm.name}
                onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.email')}
              <input
                type="email"
                value={contactForm.email}
                onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })}
              />
            </label>
            <label>
              {t('forms.phone')}
              <input
                type="text"
                value={contactForm.phone}
                onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })}
              />
            </label>
            <label>
              {t('forms.defaultCategory')}
              <select
                value={contactForm.default_category_id}
                onChange={(event) =>
                  setContactForm({ ...contactForm, default_category_id: event.target.value })
                }
              >
                <option value="">{t('common.none')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({t(`pages.movements.${cat.direction}`)})
                  </option>
                ))}
              </select>
            </label>
            {canPermission('write') && <button type="submit">{t('buttons.save')}</button>}
          </form>
          <div className="card">
            <ul className="list">
              {contacts.map((contact) => (
                <li key={contact.id} className="list-item-row">
                  <div>
                    <strong>{contact.name}</strong>
                    <div className="muted">{contact.email || t('common.none')}</div>
                  </div>
                  <div className="row-actions">
                    {canPermission('write') && <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setContactForm({
                          name: contact.name,
                          email: contact.email || '',
                          phone: contact.phone || '',
                          default_category_id: contact.default_category_id || '',
                          is_active: contact.is_active,
                        });
                        setEditingId(contact.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>}
                    {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('contacts', contact.id)}>
                      {t('buttons.delete')}
                    </button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleJobSubmit}>
            <h2>{t('pages.registry.jobs')}</h2>
            <label>
              {t('forms.jobCode')}
              <input
                type="text"
                value={jobForm.code}
                onChange={(event) => setJobForm({ ...jobForm, code: event.target.value })}
              />
            </label>
            {jobFormError && <div className="error">{jobFormError}</div>}
            <label>
              {t('forms.jobTitle')}
              <input
                type="text"
                value={jobForm.title}
                onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.jobStatus')}
              <select
                value={jobForm.is_closed ? 'closed' : 'open'}
                onChange={(event) => setJobForm({ ...jobForm, is_closed: event.target.value === 'closed' })}
              >
                <option value="open">{t('labels.jobOpen')}</option>
                <option value="closed">{t('labels.jobClosed')}</option>
              </select>
            </label>
            <label>
              {t('forms.jobBudget')}
              <input
                type="number"
                step="0.01"
                min="0"
                value={jobForm.budget}
                onChange={(event) => setJobForm({ ...jobForm, budget: event.target.value })}
              />
            </label>
            <label>
              {t('forms.jobStartDate')}
              <input
                type="date"
                value={jobForm.start_date}
                onChange={(event) => setJobForm({ ...jobForm, start_date: event.target.value })}
              />
            </label>
            <label>
              {t('forms.jobEndDate')}
              <input
                type="date"
                value={jobForm.end_date}
                onChange={(event) => setJobForm({ ...jobForm, end_date: event.target.value })}
              />
            </label>
            <label>
              {t('forms.notes')}
              <input
                type="text"
                value={jobForm.notes}
                onChange={(event) => setJobForm({ ...jobForm, notes: event.target.value })}
              />
            </label>
            <label>
              {t('forms.referenceContact')}
              <select
                value={jobForm.contact_id}
                onChange={(event) => setJobForm({ ...jobForm, contact_id: event.target.value })}
              >
                <option value="">{t('common.none')}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            {canPermission('write') && <button type="submit">{t('buttons.save')}</button>}
          </form>
          <div className="card">
            <ul className="list">
              {jobs.map((job) => (
                <li key={job.id} className="list-item-row">
                  <div>
                    <button
                      type="button"
                      className="linklike"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                    >
                      <strong>{job.title}</strong>
                    </button>
                    <div className="muted">{t('forms.jobCode')}: {job.code || t('common.none')}</div>
                    <div className="muted">{t('forms.jobStatus')}: {job.is_closed ? t('labels.jobClosed') : t('labels.jobOpen')}</div>
                    <div className="muted">{t('forms.referenceContact')}: {job.contact_name || t('common.none')}</div>
                    <div className="muted">{t('forms.jobBudget')}: {job.budget != null ? `€ ${Number(job.budget).toFixed(2)}` : t('common.none')}</div>
                  </div>
                  <div className="row-actions">
                    {canPermission('write') && <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setJobForm({
                          code: job.code || '',
                          title: job.title || '',
                          notes: job.notes || '',
                          contact_id: job.contact_id || '',
                          is_active: job.is_active,
                          is_closed: job.is_closed,
                          budget: job.budget == null ? '' : String(job.budget),
                          start_date: job.start_date ? String(job.start_date).slice(0, 10) : '',
                          end_date: job.end_date ? String(job.end_date).slice(0, 10) : '',
                        });
                        setEditingId(job.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>}
                    <button type="button" className="ghost" onClick={() => navigate(`/jobs/${job.id}`)}>
                      {t('buttons.open')}
                    </button>
                    {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('jobs', job.id)}>
                      {t('buttons.delete')}
                    </button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'properties' && (
        <div className="grid-two">
          <form className="card" onSubmit={handlePropertySubmit}>
            <h2>{t('pages.registry.propertiesBeta')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={propertyForm.name}
                onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.notes')}
              <input
                type="text"
                value={propertyForm.notes}
                onChange={(event) => setPropertyForm({ ...propertyForm, notes: event.target.value })}
              />
            </label>
            <label>
              {t('forms.referenceContact')}
              <select
                value={propertyForm.contact_id}
                onChange={(event) => setPropertyForm({ ...propertyForm, contact_id: event.target.value })}
              >
                <option value="">{t('common.none')}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            {canPermission('write') && <button type="submit">{t('buttons.save')}</button>}
          </form>
          <div className="card">
            <ul className="list">
              {properties.map((property) => (
                <li key={property.id} className="list-item-row">
                  <div>
                    <strong>{property.name}</strong>
                    <div className="muted">{property.notes || t('common.none')}</div>
                    <div className="muted">
                      {t('forms.referenceContact')}: {property.contact_name || t('common.none')}
                    </div>
                  </div>
                  <div className="row-actions">
                    {canPermission('write') && <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPropertyForm({
                          name: property.name,
                          notes: property.notes || '',
                          contact_id: property.contact_id || '',
                          is_active: property.is_active,
                        });
                        setEditingId(property.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>}
                    {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('properties', property.id)}>
                      {t('buttons.delete')}
                    </button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Modal isOpen={Boolean(createModalTab)} onClose={closeCreateModal}>
        {createModalTab === 'accounts' && (
          <form onSubmit={async (event) => { await handleAccountSubmit(event); closeCreateModal(); }}>
            <h2>{t('pages.registry.accounts')}</h2>
            <label>{t('forms.name')}<input type="text" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} required /></label>
            <label>{t('forms.type')}<select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}><option value="cash">{t('labels.cash')}</option><option value="bank">{t('labels.bank')}</option><option value="card">{t('labels.card')}</option></select></label>
            <label>{t('forms.openingBalance')}<input type="number" step="0.01" value={accountForm.opening_balance} onChange={(event) => setAccountForm({ ...accountForm, opening_balance: event.target.value })} /></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
          </form>
        )}

        {createModalTab === 'categories' && (
          <form onSubmit={async (event) => { await handleCategorySubmit(event); closeCreateModal(); }}>
            <h2>{t('pages.registry.categories')}</h2>
            <label>{t('forms.name')}<input type="text" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} required /></label>
            <label>{t('forms.direction')}<select value={categoryForm.direction} onChange={(event) => setCategoryForm({ ...categoryForm, direction: event.target.value, parent_id: '' })}><option value="income">{t('pages.movements.income')}</option><option value="expense">{t('pages.movements.expense')}</option></select></label>
            <label>{t('forms.parentCategory')}<select value={categoryForm.parent_id} onChange={(event) => setCategoryForm({ ...categoryForm, parent_id: event.target.value })}><option value="">{t('common.none')}</option>{categoryParentOptions.map((cat) => <option key={cat.id} value={cat.id}>{`${'— '.repeat(cat.depth)}${cat.name}`}</option>)}</select></label>
            <label>{t('forms.color')}<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><input type="color" value={categoryForm.color || '#2ecc71'} onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })} /><span style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #d1d5db', background: categoryForm.color || '#2ecc71' }} /></div></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
          </form>
        )}

        {createModalTab === 'contacts' && (
          <form onSubmit={async (event) => { await handleContactSubmit(event); closeCreateModal(); }}>
            <h2>{t('pages.registry.contacts')}</h2>
            <label>{t('forms.name')}<input type="text" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} required /></label>
            <label>{t('forms.email')}<input type="email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} /></label>
            <label>{t('forms.phone')}<input type="text" value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} /></label>
            <label>{t('forms.defaultCategory')}<select value={contactForm.default_category_id} onChange={(event) => setContactForm({ ...contactForm, default_category_id: event.target.value })}><option value="">{t('common.none')}</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({t(`pages.movements.${cat.direction}`)})</option>)}</select></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
          </form>
        )}

        {createModalTab === 'jobs' && (
          <form onSubmit={async (event) => { await handleJobSubmit(event); closeCreateModal(); }}>
            <h2>{t('pages.registry.jobs')}</h2>
            {jobFormError && <div className="error">{jobFormError}</div>}
            <label>{t('forms.jobCode')}<input type="text" value={jobForm.code} onChange={(event) => setJobForm({ ...jobForm, code: event.target.value })} /></label>
            <label>{t('forms.jobTitle')}<input type="text" value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} required /></label>
            <label>{t('forms.jobStatus')}<select value={jobForm.is_closed ? 'closed' : 'open'} onChange={(event) => setJobForm({ ...jobForm, is_closed: event.target.value === 'closed' })}><option value="open">{t('labels.jobOpen')}</option><option value="closed">{t('labels.jobClosed')}</option></select></label>
            <label>{t('forms.jobBudget')}<input type="number" step="0.01" min="0" value={jobForm.budget} onChange={(event) => setJobForm({ ...jobForm, budget: event.target.value })} /></label>
            <label>{t('forms.jobStartDate')}<input type="date" value={jobForm.start_date} onChange={(event) => setJobForm({ ...jobForm, start_date: event.target.value })} /></label>
            <label>{t('forms.jobEndDate')}<input type="date" value={jobForm.end_date} onChange={(event) => setJobForm({ ...jobForm, end_date: event.target.value })} /></label>
            <label>{t('forms.notes')}<input type="text" value={jobForm.notes} onChange={(event) => setJobForm({ ...jobForm, notes: event.target.value })} /></label>
            <label>{t('forms.referenceContact')}<select value={jobForm.contact_id} onChange={(event) => setJobForm({ ...jobForm, contact_id: event.target.value })}><option value="">{t('common.none')}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
          </form>
        )}

        {createModalTab === 'properties' && (
          <form onSubmit={async (event) => { await handlePropertySubmit(event); closeCreateModal(); }}>
            <h2>{t('pages.registry.propertiesBeta')}</h2>
            <label>{t('forms.name')}<input type="text" value={propertyForm.name} onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })} required /></label>
            <label>{t('forms.referenceContact')}<select value={propertyForm.contact_id} onChange={(event) => setPropertyForm({ ...propertyForm, contact_id: event.target.value })}><option value="">{t('common.none')}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
            <label>{t('forms.notes')}<textarea value={propertyForm.notes} onChange={(event) => setPropertyForm({ ...propertyForm, notes: event.target.value })} /></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default RegistryPage;
