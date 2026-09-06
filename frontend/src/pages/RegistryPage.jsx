import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import Modal from '../components/Modal.jsx';
import FloatingAddButton from '../components/FloatingAddButton.jsx';
import { formatCurrency, formatCurrencyFromCents, parseEuroInputToCents } from '../utils/currency.js';
import { buildCategoryRows, filterRegistryItems } from '../utils/registryView.js';

const initialAccount = { name: '', type: 'cash', opening_balance: 0, is_active: true };
const initialCategory = { name: '', direction: 'income', parent_id: '', color: '#2ecc71', is_active: true };
const initialContact = { name: '', email: '', phone: '', default_category_id: '', is_active: true };
const initialProperty = { external_id: '', name: '', address: '', notes: '', contact_id: '', is_active: true };
const initialJob = {
  code: '',
  title: '',
  notes: '',
  contact_id: '',
  is_closed: false,
  is_active: true,
  expectedRevenue: '',
  expectedCost: '',
  start_date: '',
  end_date: '',
};

const RegistryPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => ['jobs', 'properties', 'contacts', 'accounts', 'categories'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'jobs');
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importSummary, setImportSummary] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({});
  const [tabErrors, setTabErrors] = useState({});
  const [viewByTab, setViewByTab] = useState({});
  const loadedTabsRef = useRef({});
  const loadingTabsRef = useRef({});
  const translationRef = useRef(t);
  translationRef.current = t;

  const loadTabData = useCallback(async (targetTab, { force = false } = {}) => {
    if (loadingTabsRef.current[targetTab] || (!force && loadedTabsRef.current[targetTab])) return;
    loadingTabsRef.current[targetTab] = true;
    setTabErrors((current) => ({ ...current, [targetTab]: '' }));
    setLoadError('');
    try {
      const loaders = {
        accounts: async () => setAccounts(await api.getAccounts()),
        categories: async () => setCategories(await api.getCategories()),
        contacts: async () => setContacts(await api.getContacts()),
        properties: async () => setProperties(await api.getProperties()),
        jobs: async () => setJobs(await api.getJobs({ active: 0, include_closed: 1 })),
      };
      await loaders[targetTab]();
      loadedTabsRef.current[targetTab] = true;
      setLoadedTabs((current) => ({ ...current, [targetTab]: true }));
    } catch (error) {
      setTabErrors((current) => ({ ...current, [targetTab]: getErrorMessage(translationRef.current, error) }));
    } finally {
      loadingTabsRef.current[targetTab] = false;
    }
  }, []);

  useEffect(() => {
    loadTabData(tab);
  }, [tab, loadTabData]);

  const categoryRows = useMemo(() => buildCategoryRows(categories), [categories]);

  const categoryParentOptions = useMemo(() => {
    const byId = new Map(categories.map((cat) => [cat.id, cat]));
    const blockedIds = new Set();
    if (editingId) {
      blockedIds.add(String(editingId));
      categories.forEach((cat) => {
        let cursor = cat;
        const seen = new Set();
        while (cursor?.parent_id && !seen.has(String(cursor.id))) {
          seen.add(String(cursor.id));
          if (String(cursor.parent_id) === String(editingId)) {
            blockedIds.add(String(cat.id));
            break;
          }
          cursor = byId.get(cursor.parent_id);
        }
      });
    }
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

    return categoryRows
      .filter((cat) => !blockedIds.has(String(cat.id)))
      .map((cat) => ({ ...cat, depth: Number.isFinite(cat.depth) ? cat.depth : getDepth(cat) }));
  }, [categories, categoryRows, editingId]);

  const currentView = viewByTab[tab] || { search: '', status: 'all', sort: 'name-asc' };
  const updateCurrentView = (patch) => setViewByTab((current) => ({
    ...current,
    [tab]: { search: '', status: 'all', sort: 'name-asc', ...(current[tab] || {}), ...patch },
  }));

  const dataForTab = {
    accounts,
    categories: categoryRows,
    contacts,
    jobs,
    properties,
  };
  const visibleItems = useMemo(() => filterRegistryItems({
    items: dataForTab[tab] || [],
    tab,
    ...currentView,
    categories,
    contacts,
  }), [tab, currentView.search, currentView.status, currentView.sort, accounts, categoryRows, categories, contacts, jobs, properties]);

  const resetForms = () => {
    setAccountForm(initialAccount);
    setCategoryForm(initialCategory);
    setContactForm(initialContact);
    setPropertyForm(initialProperty);
    setJobForm(initialJob);
    setEditingId(null);
    setJobFormError('');
  };

  const ensureFormReferences = async (targetTab) => {
    const tasks = [];
    if (targetTab === 'contacts' && !loadedTabs.categories) tasks.push(loadTabData('categories'));
    if ((targetTab === 'properties' || targetTab === 'jobs') && !loadedTabs.contacts) tasks.push(loadTabData('contacts'));
    await Promise.all(tasks);
  };

  const openCreateModal = (targetTab) => {
    resetForms();
    setTab(targetTab);
    setCreateModalTab(targetTab);
    void ensureFormReferences(targetTab);
  };

  const openEditModal = (targetTab, id) => {
    setTab(targetTab);
    setEditingId(id);
    setCreateModalTab(targetTab);
    void ensureFormReferences(targetTab);
  };

  const closeCreateModal = () => {
    setCreateModalTab('');
    resetForms();
  };

  const handleCategoryParentChange = (value) => {
    const nextParentId = value || '';
    const selectedParent = categories.find((cat) => String(cat.id) === String(nextParentId));
    setCategoryForm((prev) => ({
      ...prev,
      parent_id: nextParentId,
      direction: selectedParent?.direction || prev.direction,
    }));
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    if (editingId) {
      await api.updateAccount(editingId, accountForm);
    } else {
      await api.createAccount(accountForm);
    }
    closeCreateModal();
    await loadTabData('accounts', { force: true });
  };

  const handleCategorySubmit = async (event) => {
    event.preventDefault();
    const payload = { ...categoryForm, parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null };
    if (editingId) {
      await api.updateCategory(editingId, payload);
    } else {
      await api.createCategory(payload);
    }
    closeCreateModal();
    await loadTabData('categories', { force: true });
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...contactForm,
      default_category_id: contactForm.default_category_id ? Number(contactForm.default_category_id) : null,
    };
    if (editingId) {
      await api.updateContact(editingId, payload);
    } else {
      await api.createContact(payload);
    }
    closeCreateModal();
    await loadTabData('contacts', { force: true });
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
      expectedRevenueCents: parseEuroInputToCents(jobForm.expectedRevenue),
      expectedCostCents: parseEuroInputToCents(jobForm.expectedCost),
      start_date: jobForm.start_date || null,
      end_date: jobForm.end_date || null,
    };

    try {
      if (editingId) {
        await api.updateJob(editingId, payload);
      } else {
        await api.createJob(payload);
      }
      closeCreateModal();
      await loadTabData('jobs', { force: true });
    } catch (submitError) {
      setJobFormError(getErrorMessage(t, submitError));
    }
  };

  const handlePropertySubmit = async (event) => {
    event.preventDefault();
    const payload = { ...propertyForm, contact_id: propertyForm.contact_id ? Number(propertyForm.contact_id) : null };
    if (editingId) {
      await api.updateProperty(editingId, payload);
    } else {
      await api.createProperty(payload);
    }
    closeCreateModal();
    await loadTabData('properties', { force: true });
  };


  const entityForTab = {
    accounts: 'accounts',
    categories: 'categories',
    contacts: 'contacts',
    jobs: 'jobs',
    properties: 'properties',
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    setExportLoading(true);
    try {
      const entity = entityForTab[tab];
      const { blob, headers } = await api.exportEntityCsv(entity);
      const disposition = headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallbackFilename = `flussio_${entity}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadBlob(blob, match?.[1] || fallbackFilename);
    } catch (error) {
      setLoadError(getErrorMessage(t, error));
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setImportFile(file);
    setImportSummary('');
    if (!file) {
      setImportPreview([]);
      return;
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 6);
    setImportPreview(lines);
  };

  const submitImportCsv = async () => {
    if (!importFile) return;
    try {
      const entity = entityForTab[tab];
      const result = await api.importEntityCsv(entity, importFile);
      setImportSummary(`OK: ${result.ok} | creati: ${result.created} | aggiornati: ${result.updated} | errori: ${result.errors}`);
      await loadTabData(tab, { force: true });
    } catch (error) {
      setImportSummary(getErrorMessage(t, error));
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(t('modals.confirmDelete'))) return;
    const actions = {
      accounts: () => api.deleteAccount(id),
      categories: () => api.deleteCategory(id),
      contacts: () => api.deleteContact(id),
      jobs: () => api.deleteJob(id),
      properties: () => api.deleteProperty(id),
    };
    await actions[type]();
    await loadTabData(type, { force: true });
  };

  const tabLabels = {
    accounts: t('pages.registry.accounts'),
    categories: t('pages.registry.categories'),
    contacts: t('pages.registry.contacts'),
    jobs: t('pages.registry.jobs'),
    properties: t('pages.registry.properties'),
  };
  const allItems = dataForTab[tab] || [];
  const hasActiveFilters = Boolean(currentView.search || currentView.status !== 'all');
  const statusOptions = tab === 'jobs'
    ? [{ value: 'all', label: t('common.all') }, { value: 'open', label: t('labels.jobOpen') }, { value: 'closed', label: t('labels.jobClosed') }, { value: 'inactive', label: t('labels.inactive') }]
    : [{ value: 'all', label: t('common.all') }, { value: 'active', label: t('labels.active') }, { value: 'inactive', label: t('labels.inactive') }];

  const renderStatus = (item) => (
    <span className={`status-badge ${item.is_active === false || (tab === 'jobs' && item.is_closed) ? 'inactive' : 'active'}`}>
      {tab === 'jobs'
        ? (item.is_active === false ? t('labels.inactive') : (item.is_closed ? t('labels.jobClosed') : t('labels.jobOpen')))
        : (item.is_active === false ? t('labels.inactive') : t('labels.active'))}
    </span>
  );

  const renderTabState = () => {
    if (!loadedTabs[tab] && !tabErrors[tab]) {
      return <div className="registry-loading" role="status">{t('pages.registry.loading', { entity: tabLabels[tab] })}</div>;
    }
    if (tabErrors[tab]) {
      return (
        <div className="registry-error-state" role="alert">
          <strong>{t('pages.registry.loadError')}</strong>
          <span>{tabErrors[tab]}</span>
          <button type="button" className="ghost" onClick={() => loadTabData(tab, { force: true })}>{t('buttons.retry')}</button>
        </div>
      );
    }
    if (visibleItems.length === 0) {
      return (
        <div className="empty-state">
          <h3>{hasActiveFilters ? t('pages.registry.noResults') : t('pages.registry.emptyTitle', { entity: tabLabels[tab] })}</h3>
          <p className="muted">{hasActiveFilters ? t('pages.registry.emptyFiltered') : t('pages.registry.emptyDescription', { entity: tabLabels[tab].toLocaleLowerCase() })}</p>
          {hasActiveFilters ? (
            <button type="button" className="ghost" onClick={() => updateCurrentView({ search: '', status: 'all' })}>{t('buttons.reset')}</button>
          ) : canPermission('write') ? (
            <button type="button" onClick={() => openCreateModal(tab)}>{t('pages.registry.createFirst', { entity: tabLabels[tab] })}</button>
          ) : null}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.registry.title')}</h1>
        <div className="registry-header-actions">
          {canPermission('export') && <button type="button" className="ghost" onClick={handleExportCsv} disabled={exportLoading}>
            {exportLoading ? 'Export in corso...' : 'Esporta CSV'}
          </button>}
          {canPermission('import') && <button type="button" className="ghost" onClick={() => setImportModalOpen(true)}>Importa CSV</button>}
          {canPermission('write') && (
            <button type="button" className="desktop-only registry-new-button" onClick={() => openCreateModal(tab)}>
              {t('buttons.new')}
            </button>
          )}
        </div>
      </div>

      {loadError && <div className="error">{loadError}</div>}

      <nav className="tabs registry-tabs desktop-only" aria-label={t('pages.registry.selectRegistry')}>
        {Object.entries(tabLabels).map(([tabId, label]) => (
          <button key={tabId} type="button" aria-pressed={tab === tabId} className={tab === tabId ? 'active' : ''} onClick={() => setTab(tabId)}>{label}</button>
        ))}
      </nav>

      <label className="registry-mobile-selector mobile-only">
        <span>{t('pages.registry.selectRegistry')}</span>
        <select value={tab} onChange={(event) => setTab(event.target.value)}>
          {Object.entries(tabLabels).map(([tabId, label]) => <option key={tabId} value={tabId}>{label}</option>)}
        </select>
      </label>

      <section className="registry-toolbar card" aria-label={t('pages.registry.tools')}>
        <label className="registry-search">
          <span>{t('forms.search')}</span>
          <input
            type="search"
            value={currentView.search}
            onChange={(event) => updateCurrentView({ search: event.target.value })}
            placeholder={t('pages.registry.searchPlaceholder', { entity: tabLabels[tab].toLocaleLowerCase() })}
          />
        </label>
        <label>
          <span>{t('pages.registry.status')}</span>
          <select value={currentView.status} onChange={(event) => updateCurrentView({ status: event.target.value })}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>{t('pages.registry.sort')}</span>
          <select value={currentView.sort} onChange={(event) => updateCurrentView({ sort: event.target.value })}>
            <option value="name-asc">{t('pages.registry.sortNameAsc')}</option>
            <option value="name-desc">{t('pages.registry.sortNameDesc')}</option>
            <option value="status">{t('pages.registry.sortStatus')}</option>
          </select>
        </label>
        <div className="registry-result-count" aria-live="polite">
          <strong>{visibleItems.length}</strong>
          <span>{t('pages.registry.results', { count: visibleItems.length, total: allItems.length })}</span>
        </div>
      </section>

      {renderTabState()}

      {tab === 'accounts' && visibleItems.length > 0 && (
        <div className="card">
          <ul className="list">
            {visibleItems.map((account) => (
              <li key={account.id} className="list-item-row">
                <div>
                  <div className="registry-item-title"><strong>{account.name}</strong>{renderStatus(account)}</div>
                  <div className="muted">{t(`labels.${account.type}`)}</div>
                  <div className="muted">{t('forms.openingBalance')}: {formatCurrency(account.opening_balance)}</div>
                  <div className="muted">{t('forms.currentBalance')}: {formatCurrency(account.balance)}</div>
                </div>
                <div className="row-actions">
                  {canPermission('write') && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setAccountForm({
                          name: account.name,
                          type: account.type,
                          opening_balance: account.opening_balance,
                          is_active: account.is_active,
                        });
                        openEditModal('accounts', account.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                  )}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('accounts', account.id)}>{t('buttons.delete')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'categories' && visibleItems.length > 0 && (
        <div className="card">
          <ul className="list">
            {visibleItems.map((category) => (
              <li key={category.id} className="list-item-row registry-category-row">
                <div className="registry-category-content" data-depth={category.depth || 0} style={{ '--category-depth': Math.min(category.depth || 0, 8) }}>
                  <div className="category-label">
                    <span className="dot" style={{ background: category.color || '#2ecc71' }} />
                    <strong>{category.name}</strong>
                    {renderStatus(category)}
                  </div>
                  <div className="muted">{category.depth > 0 ? category.path : t(`pages.movements.${category.direction}`)}</div>
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
                          parent_id: category.parent_id ? String(category.parent_id) : '',
                          color: category.color || '#2ecc71',
                          is_active: category.is_active,
                        });
                        openEditModal('categories', category.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                  )}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('categories', category.id)}>{t('buttons.delete')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'contacts' && visibleItems.length > 0 && (
        <div className="card">
          <ul className="list">
            {visibleItems.map((contact) => (
              <li key={contact.id} className="list-item-row">
                <div>
                  <div className="registry-item-title"><strong>{contact.name}</strong>{renderStatus(contact)}</div>
                  <div className="muted">{contact.email || t('common.none')}</div>
                  <div className="muted">{contact.phone || t('common.none')}</div>
                  {contact.default_category_name && <div className="muted">{t('forms.defaultCategory')}: {contact.default_category_name}</div>}
                </div>
                <div className="row-actions">
                  {canPermission('write') && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setContactForm({
                          name: contact.name,
                          email: contact.email || '',
                          phone: contact.phone || '',
                          default_category_id: contact.default_category_id ? String(contact.default_category_id) : '',
                          is_active: contact.is_active,
                        });
                        openEditModal('contacts', contact.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                  )}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('contacts', contact.id)}>{t('buttons.delete')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'jobs' && visibleItems.length > 0 && (
        <div className="card">
          <ul className="list">
            {visibleItems.map((job) => (
              <li key={job.id} className="list-item-row">
                <div>
                  <div className="registry-item-title"><strong>{job.title || job.name}</strong>{renderStatus(job)}</div>
                  <div className="muted">{job.code || '—'}</div>
                  <div className="muted">{job.is_closed ? t('labels.jobClosed') : t('labels.jobOpen')}</div>
                  <div className="muted">
                    {t('pages.jobs.plannedMiniLine', {
                      revenue: formatCurrencyFromCents(job.expectedRevenueCents) || t('common.notSet'),
                      cost: formatCurrencyFromCents(job.expectedCostCents) || t('common.notSet'),
                      margin:
                        job.expectedRevenueCents == null || job.expectedCostCents == null
                          ? t('common.notSet')
                          : formatCurrencyFromCents(Number(job.expectedRevenueCents) - Number(job.expectedCostCents)),
                    })}
                  </div>
                </div>
                <div className="row-actions">
                  <button type="button" className="ghost" onClick={() => navigate(`/jobs/${job.id}`)}>{t('buttons.details')}</button>
                  {canPermission('write') && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setJobForm({
                          code: job.code || '',
                          title: job.title || job.name || '',
                          notes: job.notes || '',
                          contact_id: job.contact_id ? String(job.contact_id) : '',
                          is_closed: Boolean(job.is_closed),
                          is_active: Boolean(job.is_active),
                          expectedRevenue: job.expectedRevenueCents != null ? (Number(job.expectedRevenueCents) / 100).toFixed(2) : '',
                          expectedCost: job.expectedCostCents != null ? (Number(job.expectedCostCents) / 100).toFixed(2) : '',
                          start_date: job.start_date ? String(job.start_date).slice(0, 10) : '',
                          end_date: job.end_date ? String(job.end_date).slice(0, 10) : '',
                        });
                        openEditModal('jobs', job.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                  )}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('jobs', job.id)}>{t('buttons.delete')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'properties' && visibleItems.length > 0 && (
        <div className="card">
          <ul className="list">
            {visibleItems.map((property) => (
              <li key={property.id} className="list-item-row">
                <div>
                  <div className="registry-item-title"><Link to={`/registry/properties/${property.id}`}><strong>{property.name}</strong></Link>{renderStatus(property)}</div>
                  <div className="muted">{t('forms.propertyCode')}: {property.external_id}</div>
                  {property.contact_name && <div className="muted">{t('forms.referenceContact')}: {property.contact_name}</div>}
                  <div className="muted">{property.notes || t('common.none')}</div>
                </div>
                <div className="row-actions">
                  {canPermission('write') && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPropertyForm({
                          external_id: property.external_id || '',
                          name: property.name,
                          address: property.address || '',
                          notes: property.notes || '',
                          contact_id: property.contact_id ? String(property.contact_id) : '',
                          is_active: property.is_active,
                        });
                        openEditModal('properties', property.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                  )}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete('properties', property.id)}>{t('buttons.delete')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}


      <Modal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)}>
        <div>
          <h3>Importa CSV ({entityForTab[tab]})</h3>
          <input type="file" accept=".csv,text/csv" onChange={handleImportFileChange} />
          {importPreview.length > 0 && (
            <pre style={{ maxHeight: 160, overflow: 'auto', background: '#f7f7f7', padding: 8, marginTop: 8 }}>
              {importPreview.join('\n')}
            </pre>
          )}
          {importSummary && <div className="muted" style={{ marginTop: 8 }}>{importSummary}</div>}
          <div className="modal-actions">
            <button type="button" onClick={submitImportCsv} disabled={!importFile}>Importa (Crea/Aggiorna)</button>
            <button type="button" className="ghost" onClick={() => setImportModalOpen(false)}>{t('buttons.close')}</button>
          </div>
        </div>
      </Modal>

      {canPermission('write') && !createModalTab && <FloatingAddButton onClick={() => openCreateModal(tab)} label={t('buttons.new')} />}

      <Modal isOpen={Boolean(createModalTab)} onClose={closeCreateModal}>
        <div>
          {createModalTab === 'accounts' && (
            <form onSubmit={handleAccountSubmit}>
              <h2>{t('pages.registry.accounts')}</h2>
              <label>{t('forms.name')}<input type="text" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} required /></label>
              <label>{t('forms.type')}<select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}><option value="cash">{t('labels.cash')}</option><option value="bank">{t('labels.bank')}</option><option value="card">{t('labels.card')}</option></select></label>
              <label>{t('forms.openingBalance')}<input type="number" step="0.01" value={accountForm.opening_balance} onChange={(event) => setAccountForm({ ...accountForm, opening_balance: event.target.value })} /></label>
              <label>{t('pages.registry.status')}<select value={accountForm.is_active ? 'active' : 'inactive'} onChange={(event) => setAccountForm({ ...accountForm, is_active: event.target.value === 'active' })}><option value="active">{t('labels.active')}</option><option value="inactive">{t('labels.inactive')}</option></select></label>
              <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
            </form>
          )}

          {createModalTab === 'categories' && (
            <form onSubmit={handleCategorySubmit}>
              <h2>{t('pages.registry.categories')}</h2>
              <label>{t('forms.name')}<input type="text" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} required /></label>
              <label>{t('forms.direction')}<select value={categoryForm.direction} onChange={(event) => setCategoryForm({ ...categoryForm, direction: event.target.value, parent_id: '' })}><option value="income">{t('pages.movements.income')}</option><option value="expense">{t('pages.movements.expense')}</option></select></label>
              <label>{t('forms.parentCategory')}<select value={categoryForm.parent_id} onChange={(event) => handleCategoryParentChange(event.target.value)}><option value="">{t('common.none')}</option>{categoryParentOptions.map((cat) => <option key={cat.id} value={cat.id}>{`${'— '.repeat(cat.depth)}${cat.name} (${t(`pages.movements.${cat.direction}`)})`}</option>)}</select></label>
              <label>{t('forms.color')}<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><input type="color" value={categoryForm.color || '#2ecc71'} onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })} /><span style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #d1d5db', background: categoryForm.color || '#2ecc71' }} /></div></label>
              <label>{t('pages.registry.status')}<select value={categoryForm.is_active ? 'active' : 'inactive'} onChange={(event) => setCategoryForm({ ...categoryForm, is_active: event.target.value === 'active' })}><option value="active">{t('labels.active')}</option><option value="inactive">{t('labels.inactive')}</option></select></label>
              <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
            </form>
          )}

          {createModalTab === 'contacts' && (
            <form onSubmit={handleContactSubmit}>
              <h2>{t('pages.registry.contacts')}</h2>
              <label>{t('forms.name')}<input type="text" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} required /></label>
              <label>{t('forms.email')}<input type="email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} /></label>
              <label>{t('forms.phone')}<input type="text" value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} /></label>
              <label>{t('forms.defaultCategory')}<select value={contactForm.default_category_id} onChange={(event) => setContactForm({ ...contactForm, default_category_id: event.target.value })}><option value="">{t('common.none')}</option>{categoryRows.map((cat) => <option key={cat.id} value={cat.id}>{`${'— '.repeat(cat.depth)}${cat.name} (${t(`pages.movements.${cat.direction}`)})`}</option>)}</select></label>
              <label>{t('pages.registry.status')}<select value={contactForm.is_active ? 'active' : 'inactive'} onChange={(event) => setContactForm({ ...contactForm, is_active: event.target.value === 'active' })}><option value="active">{t('labels.active')}</option><option value="inactive">{t('labels.inactive')}</option></select></label>
              <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
            </form>
          )}

          {createModalTab === 'jobs' && (
            <form onSubmit={handleJobSubmit}>
              <h2>{t('pages.registry.jobs')}</h2>
              {jobFormError && <div className="error">{jobFormError}</div>}
              <label>{t('forms.jobCode')}<input type="text" value={jobForm.code} onChange={(event) => setJobForm({ ...jobForm, code: event.target.value })} /></label>
              <label>{t('forms.jobTitle')}<input type="text" value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} required /></label>
              <label>{t('forms.jobStatus')}<select value={jobForm.is_closed ? 'closed' : 'open'} onChange={(event) => setJobForm({ ...jobForm, is_closed: event.target.value === 'closed' })}><option value="open">{t('labels.jobOpen')}</option><option value="closed">{t('labels.jobClosed')}</option></select></label>
              <label>{t('forms.jobExpectedRevenue')}<input type="number" step="0.01" min="0" placeholder="0,00" value={jobForm.expectedRevenue} onChange={(event) => setJobForm({ ...jobForm, expectedRevenue: event.target.value })} /></label>
              <label>{t('forms.jobExpectedCost')}<input type="number" step="0.01" min="0" placeholder="0,00" value={jobForm.expectedCost} onChange={(event) => setJobForm({ ...jobForm, expectedCost: event.target.value })} /></label>
              <label>{t('forms.jobStartDate')}<input type="date" value={jobForm.start_date} onChange={(event) => setJobForm({ ...jobForm, start_date: event.target.value })} /></label>
              <label>{t('forms.jobEndDate')}<input type="date" value={jobForm.end_date} onChange={(event) => setJobForm({ ...jobForm, end_date: event.target.value })} /></label>
              <label>{t('forms.notes')}<input type="text" value={jobForm.notes} onChange={(event) => setJobForm({ ...jobForm, notes: event.target.value })} /></label>
              <label>{t('forms.referenceContact')}<select value={jobForm.contact_id} onChange={(event) => setJobForm({ ...jobForm, contact_id: event.target.value })}><option value="">{t('common.none')}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
              <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
            </form>
          )}

          {createModalTab === 'properties' && (
            <form onSubmit={handlePropertySubmit}>
              <h2>{t('pages.registry.properties')}</h2>
              {editingId ? (
                <label>{t('forms.propertyCode')}<input type="text" value={propertyForm.external_id} readOnly /></label>
              ) : (
                <div className="muted" style={{ marginBottom: '0.75rem' }}>{t('forms.propertyCodeAuto')}</div>
              )}
              <label>{t('forms.name')}<input type="text" value={propertyForm.name} onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })} required /></label>
              <label>{t('forms.address')}<input value={propertyForm.address} onChange={(event) => setPropertyForm({ ...propertyForm, address: event.target.value })} /></label>
              <label>{t('forms.referenceContact')}<select value={propertyForm.contact_id} onChange={(event) => setPropertyForm({ ...propertyForm, contact_id: event.target.value })}><option value="">{t('common.none')}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
              <label>{t('forms.notes')}<textarea value={propertyForm.notes} onChange={(event) => setPropertyForm({ ...propertyForm, notes: event.target.value })} /></label>
              <label>{t('pages.registry.status')}<select value={propertyForm.is_active ? 'active' : 'inactive'} onChange={(event) => setPropertyForm({ ...propertyForm, is_active: event.target.value === 'active' })}><option value="active">{t('labels.active')}</option><option value="inactive">{t('labels.inactive')}</option></select></label>
              <div className="modal-actions"><button type="button" className="ghost" onClick={closeCreateModal}>{t('buttons.cancel')}</button><button type="submit">{t('buttons.save')}</button></div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default RegistryPage;
