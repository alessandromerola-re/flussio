import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import { formatDateIT } from '../utils/date.js';
import AttachmentPreviewModal from '../components/AttachmentPreviewModal.jsx';
import Modal from '../components/Modal.jsx';

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  type: 'income',
  amount_total: '',
  description: '',
  account_in: '',
  account_out: '',
  category_id: '',
  contact_id: '',
  property_id: '',
  job_id: '',
};

const maxAttachmentMb = 20;

const defaultFilters = {
  date_from: '',
  date_to: '',
  type: '',
  account_id: '',
  category_id: '',
  contact_id: '',
  property_id: '',
  job_id: '',
  q: '',
  limit: 30,
  offset: 0,
};

const MovementsPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(emptyForm);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState([]);
  const [showContactResults, setShowContactResults] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [newAttachmentFile, setNewAttachmentFile] = useState(null);
  const [editingMovementId, setEditingMovementId] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filterContactSearch, setFilterContactSearch] = useState('');
  const [filterContactResults, setFilterContactResults] = useState([]);
  const [showFilterContactResults, setShowFilterContactResults] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(false);

  const loadLookupData = async () => {
    const results = await Promise.allSettled([
      api.getAccounts(),
      api.getCategories(),
      api.getContacts(),
      api.getProperties(),
      api.getJobs(),
    ]);

    const [accountsResult, categoriesResult, contactsResult, propertiesResult, jobsResult] = results;

    if (accountsResult.status === 'fulfilled') setAccounts(accountsResult.value);
    if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value);
    if (contactsResult.status === 'fulfilled') setContacts(contactsResult.value);
    if (propertiesResult.status === 'fulfilled') setProperties(propertiesResult.value);
    if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value);

    if (results.some((result) => result.status === 'rejected')) {
      setLoadError(getErrorMessage(t, null));
    }
  };

  const loadMovements = async (activeFilters = defaultFilters) => {
    try {
      const data = await api.getTransactions(activeFilters);
      setMovements(data);
    } catch (loadMovementsError) {
      setLoadError(getErrorMessage(t, null));
    }
  };

  const loadData = async () => {
    setLoadError('');
    await loadLookupData();

    const deepLinkJobId = searchParams.get('job_id');
    const nextFilters = {
      ...defaultFilters,
      job_id: deepLinkJobId || '',
    };

    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    await loadMovements(nextFilters);
  };

  useEffect(() => {
    loadData();
  }, [searchParams.toString()]);

  const formatAccounts = (accountsList = []) => {
    const names = accountsList.map((account) => account?.account_name).filter(Boolean);
    return names.length ? names.join(' → ') : t('common.none');
  };

  useEffect(() => {
    const loadAttachments = async () => {
      if (!selected) {
        setAttachments([]);
        return;
      }
      try {
        const data = await api.getAttachments(selected.id);
        setAttachments(data);
      } catch (loadAttachmentError) {
        setAttachments([]);
      }
    };
    loadAttachments();
  }, [selected]);

  const movementCategories = useMemo(() => {
    if (form.type === 'income' || form.type === 'expense') {
      return categories.filter((cat) => cat.direction === form.type);
    }
    return [];
  }, [categories, form.type]);

  const groupedCategories = useMemo(() => {
    const parents = movementCategories.filter((cat) => !cat.parent_id);
    const children = movementCategories.filter((cat) => cat.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: children.filter((child) => child.parent_id === parent.id),
    }));
  }, [movementCategories]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleContactSearch = async (value) => {
    setContactSearch(value);
    if (!value) {
      handleChange('contact_id', '');
      setContactResults([]);
      setShowContactResults(false);
      return;
    }
    const results = await api.getContacts(value);
    setContactResults(results);
    setShowContactResults(true);
  };

  const handleFilterContactSearch = async (value) => {
    setFilterContactSearch(value);
    if (!value) {
      setDraftFilters((prev) => ({ ...prev, contact_id: '' }));
      setFilterContactResults([]);
      setShowFilterContactResults(false);
      return;
    }

    const results = await api.getContacts(value);
    setFilterContactResults(results);
    setShowFilterContactResults(true);
  };

  const handleSelectContact = (contact) => {
    handleChange('contact_id', contact.id);
    setContactSearch(contact.name);
    setShowContactResults(false);
    if (contact.default_category_id && form.type !== 'transfer') {
      const match = categories.find((cat) => cat.id === contact.default_category_id);
      if (match && match.direction === form.type) {
        handleChange('category_id', contact.default_category_id);
      }
    }
  };

  const handleSelectFilterContact = (contact) => {
    setDraftFilters((prev) => ({ ...prev, contact_id: contact.id }));
    setFilterContactSearch(contact.name);
    setShowFilterContactResults(false);
  };

  const validate = () => {
    if (!form.amount_total || Number(form.amount_total) <= 0) {
      return t('errors.VALIDATION_MISSING_AMOUNT');
    }
    if (form.type === 'transfer') {
      if (!form.account_out || !form.account_in) {
        return t('errors.VALIDATION_ACCOUNT_REQUIRED');
      }
      if (form.account_out === form.account_in) {
        return t('errors.VALIDATION_TRANSFER_ACCOUNTS');
      }
    } else if (!form.account_in && !form.account_out) {
      return t('errors.VALIDATION_ACCOUNT_REQUIRED');
    }
    return '';
  };

  const hasActiveFilters = useMemo(
    () =>
      Object.entries(filters).some(([key, value]) => {
        if (key === 'limit') {
          return Number(value) !== 30;
        }
        if (key === 'offset') {
          return Number(value) !== 0;
        }
        return value !== '' && value != null;
      }),
    [filters]
  );



  const activeFilterChips = useMemo(() => {
    const labels = [];

    if (filters.date_from) labels.push({ key: 'date_from', label: `${t('pages.movements.dateFrom')}: ${filters.date_from}` });
    if (filters.date_to) labels.push({ key: 'date_to', label: `${t('pages.movements.dateTo')}: ${filters.date_to}` });
    if (filters.type) labels.push({ key: 'type', label: `${t('pages.movements.type')}: ${t(`pages.movements.${filters.type}`)}` });

    const account = accounts.find((a) => String(a.id) === String(filters.account_id));
    if (filters.account_id && account) labels.push({ key: 'account_id', label: `${t('pages.movements.account')}: ${account.name}` });

    const category = categories.find((c) => String(c.id) === String(filters.category_id));
    if (filters.category_id && category) labels.push({ key: 'category_id', label: `${t('pages.movements.category')}: ${category.name}` });

    const contact = contacts.find((c) => String(c.id) === String(filters.contact_id));
    if (filters.contact_id && contact) labels.push({ key: 'contact_id', label: `${t('pages.movements.contact')}: ${contact.name}` });

    const property = properties.find((p) => String(p.id) === String(filters.property_id));
    if (filters.property_id && property) labels.push({ key: 'property_id', label: `${t('pages.movements.property')}: ${property.name}` });

    const job = jobs.find((j) => String(j.id) === String(filters.job_id));
    if (filters.job_id && job) labels.push({ key: 'job_id', label: `${t('pages.movements.job')}: ${job.name || job.title}` });

    if (filters.q) labels.push({ key: 'q', label: `${t('pages.movements.searchText')}: ${filters.q}` });

    return labels;
  }, [filters, accounts, categories, contacts, properties, jobs, t]);

  const clearFilterChip = async (key) => {
    const nextFilters = { ...filters, [key]: defaultFilters[key], offset: 0 };
    setFilters(nextFilters);
    setDraftFilters(nextFilters);

    if (key === 'contact_id') {
      setFilterContactSearch('');
      setFilterContactResults([]);
      setShowFilterContactResults(false);
    }

    await loadMovements(nextFilters);
  };

  const applyFilters = async () => {
    const nextFilters = {
      ...draftFilters,
      offset: 0,
    };
    setFilters(nextFilters);
    await loadMovements(nextFilters);
  };

  const resetFilters = async () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setFilterContactSearch('');
    setFilterContactResults([]);
    setShowFilterContactResults(false);
    await loadMovements(defaultFilters);
  };



  const closeMovementModal = () => {
    setMovementModalOpen(false);
    setEditingMovementId(null);
    setForm(emptyForm);
    setContactSearch('');
    setNewAttachmentFile(null);
    setError('');
    setSubmitMessage('');
  };

  const openNewMovementModal = () => {
    setEditingMovementId(null);
    setForm(emptyForm);
    setContactSearch('');
    setNewAttachmentFile(null);
    setError('');
    setSubmitMessage('');
    setMovementModalOpen(true);
  };

  const handleExportCsv = async () => {
    const { blob, headers } = await api.exportTransactions(filters);
    const disposition = headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `flussio_movimenti_${new Date().toISOString().slice(0, 10)}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (newAttachmentFile && newAttachmentFile.size > maxAttachmentMb * 1024 * 1024) {
      setError(t('errors.FILE_TOO_LARGE', { maxMb: maxAttachmentMb }));
      setSubmitMessage('');
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSubmitMessage('');
      return;
    }

    setError('');
    setSubmitMessage('');

    try {
      const accountsPayload = [];
      if (form.type === 'transfer') {
        accountsPayload.push({ account_id: Number(form.account_out), direction: 'out', amount: Number(form.amount_total) });
        accountsPayload.push({ account_id: Number(form.account_in), direction: 'in', amount: Number(form.amount_total) });
      } else {
        const direction = form.type === 'income' ? 'in' : 'out';
        const accountId = Number(form.account_in || form.account_out);
        accountsPayload.push({ account_id: accountId, direction, amount: Number(form.amount_total) });
      }

      const payload = {
        date: form.date,
        type: form.type,
        amount_total: Number(form.amount_total),
        description: form.description,
        category_id: form.category_id ? Number(form.category_id) : null,
        contact_id: form.contact_id ? Number(form.contact_id) : null,
        property_id: form.property_id ? Number(form.property_id) : null,
        job_id: form.job_id ? Number(form.job_id) : null,
        accounts: accountsPayload,
      };

      let transaction = null;
      if (editingMovementId) {
        transaction = await api.updateTransaction(editingMovementId, payload);
      } else {
        transaction = await api.createTransaction(payload);
      }

      if (newAttachmentFile && transaction?.id) {
        await api.uploadAttachment(transaction.id, newAttachmentFile);
      }

      setForm(emptyForm);
      setNewAttachmentFile(null);
      setContactSearch('');
      setEditingMovementId(null);
      await loadMovements(filters);
      setAccounts(await api.getAccounts());
      setSubmitMessage(t('pages.movements.createSuccess'));
      setMovementModalOpen(false);
    } catch (submitError) {
      setError(getErrorMessage(t, submitError));
      setSubmitMessage(t('pages.movements.createError'));
    }
  };

  const handleStartEdit = () => {
    if (!selected) {
      return;
    }

    const selectedAccounts = selected.accounts || [];
    const outEntry = selectedAccounts.find((entry) => entry.direction === 'out');
    const inEntry = selectedAccounts.find((entry) => entry.direction === 'in');
    const singleEntry = selectedAccounts[0];

    setForm({
      date: selected.date ? String(selected.date).slice(0, 10) : emptyForm.date,
      type: selected.type || 'income',
      amount_total: String(Math.abs(Number(selected.amount_total) || 0)),
      description: selected.description || '',
      account_in:
        selected.type === 'transfer'
          ? String(inEntry?.account_id || '')
          : String(singleEntry?.account_id || inEntry?.account_id || outEntry?.account_id || ''),
      account_out: selected.type === 'transfer' ? String(outEntry?.account_id || '') : '',
      category_id: selected.category_id ? String(selected.category_id) : '',
      contact_id: selected.contact_id ? String(selected.contact_id) : '',
      property_id: selected.property_id ? String(selected.property_id) : '',
      job_id: selected.job_id ? String(selected.job_id) : '',
    });

    setContactSearch(selected.contact_name || '');
    setEditingMovementId(selected.id);
    setNewAttachmentFile(null);
    setMovementModalOpen(true);
    setSelected(null);
    setError('');
    setSubmitMessage('');
  };

  const handleUploadAttachment = async () => {
    if (!selected || !attachmentFile) {
      return;
    }

    if (attachmentFile.size > maxAttachmentMb * 1024 * 1024) {
      setUploadError(t('errors.FILE_TOO_LARGE', { maxMb: maxAttachmentMb }));
      setUploadMessage('');
      return;
    }

    setUploadLoading(true);
    setUploadError('');
    setUploadMessage('');

    try {
      await api.uploadAttachment(selected.id, attachmentFile);
      setAttachmentFile(null);
      setAttachments(await api.getAttachments(selected.id));
      setUploadMessage(t('pages.movements.uploadSuccess'));
    } catch (uploadAttachmentError) {
      const messageKey = uploadAttachmentError.code
        ? `errors.${uploadAttachmentError.code}`
        : 'pages.movements.uploadError';
      setUploadError(t(messageKey));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    const blob = await api.downloadAttachment(attachment.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAttachment = async (attachmentId) => {
    await api.deleteAttachment(attachmentId);
    if (!selected) {
      return;
    }
    setAttachments(await api.getAttachments(selected.id));
  };


  const getAttachmentTypeLabel = (attachment) => {
    const mime = (attachment?.mime_type || '').toLowerCase();
    if (mime.startsWith('image/')) {
      return 'image';
    }
    if (mime === 'application/pdf') {
      return 'pdf';
    }
    return 'other';
  };

  const fetchPreviewBlob = async (attachment) => api.downloadAttachment(attachment.id);

  const handleOpenPreview = (attachment) => {
    setPreviewAttachment(attachment);
  };

  const handleClosePreview = () => {
    setPreviewAttachment(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('modals.confirmDelete'))) {
      return;
    }
    await api.deleteTransaction(id);
    setSelected(null);
    await loadMovements(filters);
    setAccounts(await api.getAccounts());
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.movements.title')}</h1>
      </div>
      {loadError && <div className="error">{loadError}</div>}

      <div className="row-actions movements-toolbar">
        <button
          type="button"
          className="primary"
          onClick={openNewMovementModal}
          disabled={!canPermission('write')}
        >
          {t('pages.movements.new')}
        </button>
        <button type="button" className="ghost" onClick={() => setFiltersOpen((v) => !v)}>{t('pages.movements.filters')} {hasActiveFilters ? '(attivi)' : ''}</button>
        {!filtersOpen && hasActiveFilters && <button type="button" className="ghost" onClick={resetFilters}>{t('buttons.reset')}</button>}
      </div>

      {!filtersOpen && hasActiveFilters && (
        <div className="filter-chip-list">
          {activeFilterChips.map((chip) => (
            <button key={chip.key} type="button" className="filter-chip" onClick={() => clearFilterChip(chip.key)} title={t('buttons.reset')}>
              {chip.label} ✕
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={movementModalOpen} onClose={closeMovementModal}>
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <h2>{editingMovementId ? `${t('buttons.edit')} #${editingMovementId}` : t('pages.movements.new')}</h2>
            <div className="form-grid">
            <label>
              {t('pages.movements.date')}
              <input type="date" value={form.date} onChange={(event) => handleChange('date', event.target.value)} required />
            </label>
            <label>
              {t('pages.movements.type')}
              <select value={form.type} onChange={(event) => handleChange('type', event.target.value)}>
                <option value="income">{t('pages.movements.income')}</option>
                <option value="expense">{t('pages.movements.expense')}</option>
                <option value="transfer">{t('pages.movements.transfer')}</option>
              </select>
            </label>
            <label>
              {t('pages.movements.amount')}
              <input type="number" step="0.01" value={form.amount_total} onChange={(event) => handleChange('amount_total', event.target.value)} required />
            </label>
            {form.type === 'transfer' ? (
              <>
                <label>
                  {t('pages.movements.accountFrom')}
                  <select value={form.account_out} onChange={(event) => handleChange('account_out', event.target.value)} required>
                    <option value="">{t('common.none')}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('pages.movements.accountTo')}
                  <select value={form.account_in} onChange={(event) => handleChange('account_in', event.target.value)} required>
                    <option value="">{t('common.none')}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label>
                {t('pages.movements.account')}
                <select value={form.account_in || form.account_out} onChange={(event) => handleChange('account_in', event.target.value)} required>
                  <option value="">{t('common.none')}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="relative">
              {t('pages.movements.contact')}
              <input
                type="text"
                value={contactSearch}
                onChange={(event) => handleContactSearch(event.target.value)}
                onFocus={() => contactSearch && setShowContactResults(true)}
                placeholder={t('placeholders.searchContacts')}
              />
              {showContactResults && contactResults.length > 0 && (
                <ul className="dropdown">
                  {contactResults.map((contact) => (
                    <li key={contact.id}>
                      <button type="button" onClick={() => handleSelectContact(contact)}>{contact.name}</button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            {form.type !== 'transfer' && (
              <label>
                {t('pages.movements.category')}
                <select value={form.category_id} onChange={(event) => handleChange('category_id', event.target.value)}>
                  <option value="">{t('common.none')}</option>
                  {groupedCategories.map((category) => (
                    <optgroup key={category.id} label={category.name}>
                      <option value={category.id}>{category.name}</option>
                      {category.children.map((child) => (
                        <option key={child.id} value={child.id}>└ {child.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t('pages.movements.job')}
              <select value={form.job_id} onChange={(event) => handleChange('job_id', event.target.value)}>
                <option value="">{t('common.none')}</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.name}</option>
                ))}
              </select>
            </label>
            <label className="full">
              {t('pages.movements.description')}
              <input
                type="text"
                value={form.description}
                onChange={(event) => handleChange('description', event.target.value)}
                placeholder={t('placeholders.description')}
              />
            </label>
            <label className="full">
              {t('pages.movements.attachments')}
              <input
                type="file"
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                onChange={(event) => setNewAttachmentFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
          {error && <div className="error">{error}</div>}
          {submitMessage && <div className={error ? 'error' : 'success'}>{submitMessage}</div>}
            <div className="modal-actions">
              {canPermission('write') && <button type="submit">{editingMovementId ? t('buttons.edit') : t('buttons.save')}</button>}
              <button type="button" className="ghost" onClick={closeMovementModal}>
                {t('buttons.cancel')}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <div className="grid-two">
        <div className="card">
          <h2>{t('pages.movements.filters')}</h2>
          {hasActiveFilters && <div className="muted">{t('pages.movements.activeFilters')}</div>}
          {filtersOpen && (
            <>
<div className="form-grid">
            <label>
              {t('pages.movements.dateFrom')}
              <input
                type="date"
                value={draftFilters.date_from}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, date_from: event.target.value }))}
              />
            </label>
            <label>
              {t('pages.movements.dateTo')}
              <input
                type="date"
                value={draftFilters.date_to}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, date_to: event.target.value }))}
              />
            </label>
            <label>
              {t('pages.movements.type')}
              <select
                value={draftFilters.type}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                <option value="income">{t('pages.movements.income')}</option>
                <option value="expense">{t('pages.movements.expense')}</option>
                <option value="transfer">{t('pages.movements.transfer')}</option>
              </select>
            </label>
            <label>
              {t('pages.movements.account')}
              <select
                value={draftFilters.account_id}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, account_id: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t('pages.movements.category')}
              <select
                value={draftFilters.category_id}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, category_id: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="relative">
              {t('pages.movements.contact')}
              <input
                type="text"
                value={filterContactSearch}
                onChange={(event) => handleFilterContactSearch(event.target.value)}
                onFocus={() => filterContactSearch && setShowFilterContactResults(true)}
                placeholder={t('placeholders.searchContacts')}
              />
              {showFilterContactResults && filterContactResults.length > 0 && (
                <ul className="dropdown">
                  {filterContactResults.map((contact) => (
                    <li key={contact.id}>
                      <button type="button" onClick={() => handleSelectFilterContact(contact)}>{contact.name}</button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            <label>
              {t('pages.movements.job')}
              <select
                value={draftFilters.job_id}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, job_id: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t('pages.movements.searchText')}
              <input
                type="text"
                value={draftFilters.q}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder={t('pages.movements.searchText')}
              />
            </label>
              </div>
              <div className="row-actions">
                <button type="button" onClick={applyFilters}>{t('buttons.apply')}</button>
                <button type="button" className="ghost" onClick={resetFilters}>{t('buttons.reset')}</button>
                <button type="button" className="ghost" onClick={handleExportCsv}>{t('buttons.exportCsv')}</button>
              </div>

              {hasActiveFilters && (
                <div className="filter-chip-list">
                  {activeFilterChips.map((chip) => (
                    <button key={chip.key} type="button" className="filter-chip" onClick={() => clearFilterChip(chip.key)} title={t('buttons.reset')}>
                      {chip.label} ✕
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <h2>{t('pages.movements.latest')}</h2>
          <div className="list">
            {movements.map((movement) => {
              const attachmentCount = Number(movement.attachment_count || movement.attachments_count || 0);

              return (
              <button key={movement.id} type="button" className="list-item" onClick={() => setSelected(movement)}>
                <div>
                  <strong className="movement-title-badge">{movement.description || movement.type}</strong>
                  <div className="muted">{formatDateIT(movement.date)}</div>
                  {movement.job_name && (
                    <div className="muted">{t('pages.movements.job')}: {movement.job_name}</div>
                  )}
                  <div className="muted">{t('pages.movements.account')}: {formatAccounts(movement.accounts)}</div>
                  <div className="muted">{t('pages.movements.category')}: {movement.category_name || t('common.none')}</div>
                  <div className="muted">{t('pages.movements.contact')}: {movement.contact_name || t('common.none')}</div>
                  {movement.recurring_template_title && (
                    <div className="muted">
                      {t('pages.recurring.badge')}: <a href={`/recurring?template_id=${movement.recurring_template_id}`}>{movement.recurring_template_title}</a>
                    </div>
                  )}
                  {attachmentCount > 0 && (
                    <div className="attachment-indicator" aria-label={`${attachmentCount} attachments`}>
                      📎 {attachmentCount}
                    </div>
                  )}
                </div>
                <div className={movement.type === 'income' ? 'amount positive' : movement.type === 'expense' ? 'amount negative' : 'amount'}>
                  € {Number(movement.amount_total).toFixed(2)}
                </div>
              </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <Modal isOpen={Boolean(selected)} onClose={() => {
          setSelected(null);
          setUploadError('');
          setUploadMessage('');
          setAttachmentFile(null);
          setPreviewAttachment(null);
        }}>
          <div className="modal-content">
            <h2>{t('pages.movements.details')}</h2>
            <p><strong>{t('pages.movements.date')}:</strong> {formatDateIT(selected.date)}</p>
            <p><strong>{t('pages.movements.type')}:</strong> {t(`pages.movements.${selected.type}`)}</p>
            <p><strong>{t('pages.movements.amount')}:</strong> € {Number(selected.amount_total).toFixed(2)}</p>
            <p><strong>{t('pages.movements.category')}:</strong> {selected.category_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.contact')}:</strong> {selected.contact_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.job')}:</strong> {selected.job_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.description')}:</strong> {selected.description || t('common.none')}</p>
            {selected.recurring_template_title && (
              <p><strong>{t('pages.recurring.badge')}:</strong> <a href={`/recurring?template_id=${selected.recurring_template_id}`}>{selected.recurring_template_title}</a></p>
            )}
            <div>
              <strong>{t('pages.movements.attachments')}:</strong>
              <ul>
                {attachments.length === 0 && <li className="muted">{t('pages.movements.noAttachments')}</li>}
                {attachments.map((item) => (
                  <li key={item.id} className="list-item-row">
                    <div className="attachment-name-row">
                      <button
                        type="button"
                        className="linklike"
                        onClick={() => handleOpenPreview(item)}
                      >
                        {item.original_name || item.file_name}
                      </button>
                      <span className="muted attachment-type">[{getAttachmentTypeLabel(item)}]</span>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="ghost" onClick={() => handleDownloadAttachment(item)}>{t('buttons.download')}</button>
                      <button type="button" className="danger" onClick={() => handleDeleteAttachment(item.id)}>{t('buttons.delete')}</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="attachment-upload">
                <input
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={handleUploadAttachment}
                  disabled={!attachmentFile || !selected || uploadLoading}
                >
                  {uploadLoading ? t('common.loading') : t('buttons.upload')}
                </button>
              </div>
              {uploadMessage && <div className="muted">{uploadMessage}</div>}
              {uploadError && <div className="error">{uploadError}</div>}
            </div>
            <div className="modal-actions">
              {canPermission('write') && <button type="button" onClick={handleStartEdit}>{t('buttons.edit')}</button>}
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setSelected(null);
                  setUploadError('');
                  setUploadMessage('');
                  setAttachmentFile(null);
                  setPreviewAttachment(null);
                }}
              >
                {t('buttons.close')}
              </button>
              {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDelete(selected.id)}>{t('buttons.delete')}</button>}
            </div>
          </div>
        </Modal>
      )}

      <AttachmentPreviewModal
        isOpen={Boolean(previewAttachment)}
        attachment={previewAttachment}
        onClose={handleClosePreview}
        fetchPreviewBlob={fetchPreviewBlob}
        onDownload={handleDownloadAttachment}
      />
    </div>
  );
};

export default MovementsPage;
