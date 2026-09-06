import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import { formatDateInTimeZone, formatDateIT } from '../utils/date.js';
import { formatCurrency } from '../utils/currency.js';
import { previousPageAfterDelete } from '../utils/pagination.js';
import { saveMovementWithAttachment } from '../utils/saveMovement.js';
import AttachmentPreviewModal from '../components/AttachmentPreviewModal.jsx';
import Modal from '../components/Modal.jsx';
import FloatingAddButton from '../components/FloatingAddButton.jsx';

const emptyForm = {
  date: formatDateInTimeZone(new Date()),
  type: 'expense',
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
  is_recurring: '',
  has_attachments: '',
  sort_by: 'date',
  sort_dir: 'desc',
  limit: 30,
  offset: 0,
};

const MovementsPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const newPropertyId = searchParams.get('new') === '1' && canPermission('write') ? searchParams.get('property_id') || '' : '';
  const [form, setForm] = useState(() => ({ ...emptyForm, date: formatDateInTimeZone(new Date()), property_id: newPropertyId }));
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [movements, setMovements] = useState([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  const [movementLoadError, setMovementLoadError] = useState('');
  const [lookupLoadError, setLookupLoadError] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState([]);
  const [showContactResults, setShowContactResults] = useState(false);
  const [contactActiveIndex, setContactActiveIndex] = useState(-1);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [newAttachmentFile, setNewAttachmentFile] = useState(null);
  const [editingMovementId, setEditingMovementId] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filterContactSearch, setFilterContactSearch] = useState('');
  const [filterContactResults, setFilterContactResults] = useState([]);
  const [showFilterContactResults, setShowFilterContactResults] = useState(false);
  const [filterContactActiveIndex, setFilterContactActiveIndex] = useState(-1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [movementModalOpen, setMovementModalOpen] = useState(Boolean(newPropertyId));
  const [submitLoading, setSubmitLoading] = useState(false);
  const [createdMovementId, setCreatedMovementId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const movementRequestId = useRef(0);
  const filtersRef = useRef(defaultFilters);

  const loadLookupData = async () => {
    setLookupLoadError('');
    const results = await Promise.allSettled([
      api.getAccounts(),
      api.getCategories(),
      api.getContacts(),
      api.getProperties(),
      api.getJobs({ active: 0, include_closed: 1 }),
    ]);

    const [accountsResult, categoriesResult, contactsResult, propertiesResult, jobsResult] = results;

    if (accountsResult.status === 'fulfilled') setAccounts(accountsResult.value);
    if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value);
    if (contactsResult.status === 'fulfilled') setContacts(contactsResult.value);
    if (propertiesResult.status === 'fulfilled') setProperties(propertiesResult.value);
    if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value);

    if (results.some((result) => result.status === 'rejected')) {
      setLookupLoadError(`Impossibile caricare le anagrafiche. ${getErrorMessage(t, null)}`);
    }
  };

  const loadMovements = async (activeFilters = defaultFilters) => {
    const requestId = ++movementRequestId.current;
    setMovementLoadError('');
    setMovementsLoading(true);
    try {
      const pageSize = Number(activeFilters.limit || 30);
      const response = await api.getTransactions({ ...activeFilters, limit: pageSize });
      const rows = response?.data ?? response;
      const page = { rows, hasNext: response?.headers?.get('X-Has-More') === 'true' };
      if (requestId !== movementRequestId.current) return page;
      setMovements(rows);
      setHasNextPage(page.hasNext);
      setTotalCount(Number(response?.headers?.get('X-Total-Count') || rows.length));
      return page;
    } catch (loadMovementsError) {
      if (requestId !== movementRequestId.current) return null;
      setMovements([]);
      setHasNextPage(false);
      setTotalCount(0);
      setMovementLoadError(`Impossibile caricare i movimenti. ${getErrorMessage(t, null)}`);
    } finally {
      if (requestId === movementRequestId.current) setMovementsLoading(false);
    }
  };

  const loadData = async () => {
    await loadLookupData();

    const nextFilters = {
      ...defaultFilters,
      date_from: searchParams.get('date_from') || '',
      date_to: searchParams.get('date_to') || '',
      type: searchParams.get('type') || '',
      account_id: searchParams.get('account_id') || '',
      category_id: searchParams.get('category_id') || '',
      contact_id: searchParams.get('contact_id') || '',
      property_id: searchParams.get('property_id') || '',
      job_id: searchParams.get('job_id') || '',
      q: searchParams.get('q') || '',
      is_recurring: searchParams.get('is_recurring') || '',
      has_attachments: searchParams.get('has_attachments') || '',
      sort_by: searchParams.get('sort_by') || defaultFilters.sort_by,
      sort_dir: searchParams.get('sort_dir') || defaultFilters.sort_dir,
      limit: Number(searchParams.get('limit') || defaultFilters.limit),
      offset: Number(searchParams.get('offset') || defaultFilters.offset),
    };

    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    setSearchInput(nextFilters.q);
    setFilterContactSearch('');
    await loadMovements(nextFilters);
  };

  useEffect(() => {
    loadData();
  }, [searchParams.toString()]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentFilters = filtersRef.current;
      if (searchInput === currentFilters.q) return;
      const nextFilters = { ...currentFilters, q: searchInput.trim(), offset: 0 };
      setFilters(nextFilters);
      setDraftFilters((previous) => ({ ...previous, q: nextFilters.q, offset: 0 }));
      loadMovements(nextFilters);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const formatAccounts = (accountsList = []) => {
    const names = accountsList.map((account) => account?.account_name).filter(Boolean);
    return names.length ? names.join(' → ') : t('common.none');
  };

  const normalizeDirection = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['income', 'in', 'entrata'].includes(normalized)) {
      return 'income';
    }
    if (['expense', 'out', 'uscita'].includes(normalized)) {
      return 'expense';
    }
    return normalized;
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
    if (form.type === 'transfer') {
      return [];
    }

    if (form.type === 'income' || form.type === 'expense') {
      return categories.filter((cat) => normalizeDirection(cat.direction) === form.type);
    }

    return categories.filter((cat) => ['income', 'expense'].includes(normalizeDirection(cat.direction)));
  }, [categories, form.type]);

  const movementCategoryOptions = useMemo(() => {
    const byParentId = new Map();

    for (const category of movementCategories) {
      const parentId = category.parent_id == null ? null : category.parent_id;
      if (!byParentId.has(parentId)) {
        byParentId.set(parentId, []);
      }
      byParentId.get(parentId).push(category);
    }

    const options = [];
    const visited = new Set();

    const appendBranch = (category, depth) => {
      if (visited.has(category.id)) {
        return;
      }

      visited.add(category.id);
      const direction = normalizeDirection(category.direction);
      const directionLabel = direction === 'income' || direction === 'expense'
        ? ` (${t(`pages.movements.${direction}`)})`
        : '';

      options.push({
        id: category.id,
        label: `${'— '.repeat(depth)}${category.name}${directionLabel}`,
      });

      const children = byParentId.get(category.id) || [];
      for (const child of children) {
        appendBranch(child, depth + 1);
      }
    };

    const roots = byParentId.get(null) || [];
    for (const root of roots) {
      appendBranch(root, 0);
    }

    for (const category of movementCategories) {
      if (!visited.has(category.id)) {
        appendBranch(category, 0);
      }
    }

    return options;
  }, [movementCategories, t]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCategoryChange = (value) => {
    if (!value) {
      handleChange('category_id', '');
      return;
    }

    const selectedCategory = categories.find((cat) => String(cat.id) === String(value));
    const selectedDirection = normalizeDirection(selectedCategory?.direction);

    setForm((prev) => ({
      ...prev,
      category_id: value,
      type: selectedDirection === 'income' || selectedDirection === 'expense' ? selectedDirection : prev.type,
    }));
  };

  const handleTypeChange = (value) => {
    setForm((prev) => {
      const next = { ...prev, type: value };
      if (value === 'transfer') {
        next.category_id = '';
        return next;
      }

      if (value === 'income' || value === 'expense') {
        const selectedCategory = categories.find((cat) => String(cat.id) === String(prev.category_id));
        if (selectedCategory && normalizeDirection(selectedCategory.direction) !== value) {
          next.category_id = '';
        }
      }

      return next;
    });
  };

  const handleContactSearch = (value) => {
    setContactSearch(value);
    if (!value) {
      handleChange('contact_id', '');
      setContactResults([]);
      setShowContactResults(false);
      return;
    }
    setShowContactResults(true);
  };

  const handleFilterContactSearch = (value) => {
    setFilterContactSearch(value);
    if (!value) {
      setDraftFilters((prev) => ({ ...prev, contact_id: '' }));
      setFilterContactResults([]);
      setShowFilterContactResults(false);
      return;
    }

    setShowFilterContactResults(true);
  };

  useEffect(() => {
    if (!contactSearch.trim()) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      const results = await api.getContacts(contactSearch.trim());
      if (active) {
        setContactResults(results);
        setContactActiveIndex(-1);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [contactSearch]);

  useEffect(() => {
    if (!filterContactSearch.trim()) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      const results = await api.getContacts(filterContactSearch.trim());
      if (active) {
        setFilterContactResults(results);
        setFilterContactActiveIndex(-1);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filterContactSearch]);

  const handleSelectContact = (contact) => {
    handleChange('contact_id', contact.id);
    setContactSearch(contact.name);
    setShowContactResults(false);
    if (contact.default_category_id && form.type !== 'transfer') {
      const match = categories.find((cat) => cat.id === contact.default_category_id);
      if (match && normalizeDirection(match.direction) === form.type) {
        handleChange('category_id', contact.default_category_id);
      }
    }
  };

  const handleSelectFilterContact = (contact) => {
    setDraftFilters((prev) => ({ ...prev, contact_id: contact.id }));
    setFilterContactSearch(contact.name);
    setShowFilterContactResults(false);
  };

  const handleAutocompleteKeyDown = (event, results, activeIndex, setActiveIndex, selectResult, closeResults) => {
    if (!results.length) {
      if (event.key === 'Escape') closeResults();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((activeIndex + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    } else if (event.key === 'Escape') {
      closeResults();
    }
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
        if (key === 'sort_by') return value !== defaultFilters.sort_by;
        if (key === 'sort_dir') return value !== defaultFilters.sort_dir;
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
    if (filters.is_recurring !== '') labels.push({ key: 'is_recurring', label: `Ricorrenza: ${filters.is_recurring === '1' ? 'sì' : 'no'}` });
    if (filters.has_attachments !== '') labels.push({ key: 'has_attachments', label: `Allegati: ${filters.has_attachments === '1' ? 'presenti' : 'assenti'}` });
    if (filters.sort_by !== defaultFilters.sort_by || filters.sort_dir !== defaultFilters.sort_dir) {
      labels.push({ key: 'sort', label: `${t('pages.movements.sort')}: ${t(`pages.movements.sort.${filters.sort_by}`)} (${filters.sort_dir === 'asc' ? '↑' : '↓'})` });
    }

    return labels;
  }, [filters, accounts, categories, contacts, properties, jobs, t]);

  const clearFilterChip = async (key) => {
    const nextFilters = key === 'sort'
      ? { ...filters, sort_by: defaultFilters.sort_by, sort_dir: defaultFilters.sort_dir, offset: 0 }
      : { ...filters, [key]: defaultFilters[key], offset: 0 };
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    if (key === 'q') setSearchInput('');

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
    setSearchInput(nextFilters.q);
    await loadMovements(nextFilters);
  };

  const resetFilters = async () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setSearchInput('');
    setFilterContactSearch('');
    setFilterContactResults([]);
    setShowFilterContactResults(false);
    await loadMovements(defaultFilters);
  };



  const closeMovementModal = () => {
    if (submitLoading || createdMovementId) return;
    setMovementModalOpen(false);
    setEditingMovementId(null);
    setForm(emptyForm);
    setContactSearch('');
    setNewAttachmentFile(null);
    setError('');
    setSubmitMessage('');
    setCreatedMovementId(null);
  };

  const finishWithoutAttachment = async () => {
    if (!createdMovementId || submitLoading) return;
    setSubmitLoading(true);
    try {
      await loadMovements(filters);
      await loadLookupData();
      setMovementModalOpen(false);
      setEditingMovementId(null);
      setForm(emptyForm);
      setContactSearch('');
      setNewAttachmentFile(null);
      setError('');
      setSubmitMessage('');
      setCreatedMovementId(null);
      setPageMessage('Operazione completata: movimento salvato senza allegato.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const openNewMovementModal = async () => {
    await loadLookupData();
    setEditingMovementId(null);
    setForm({ ...emptyForm, date: formatDateInTimeZone(new Date()), property_id: filters.property_id });
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
    if (submitLoading) return;

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

    setSubmitLoading(true);
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

      const movementId = await saveMovementWithAttachment({
        existingId: createdMovementId,
        saveMovement: async () => editingMovementId
          ? api.updateTransaction(editingMovementId, payload)
          : api.createTransaction(payload),
        uploadAttachment: api.uploadAttachment,
        attachment: newAttachmentFile,
        onMovementSaved: (id) => setCreatedMovementId(id),
      });

      setForm(emptyForm);
      setNewAttachmentFile(null);
      setContactSearch('');
      setEditingMovementId(null);
      setCreatedMovementId(null);
      await loadMovements(filters);
      await loadLookupData();
      setSubmitMessage(newAttachmentFile ? 'Movimento e allegato salvati.' : t('pages.movements.createSuccess'));
      setPageMessage(newAttachmentFile ? 'Operazione completata: movimento e allegato salvati.' : 'Operazione completata: movimento salvato.');
      setMovementModalOpen(false);
    } catch (submitError) {
      setError(getErrorMessage(t, submitError));
      setSubmitMessage(submitError.movementId || createdMovementId
        ? 'Movimento creato, ma allegato non caricato. Riprova: verrà caricato sul movimento esistente.'
        : 'Movimento non creato. Controlla i dati e riprova.');
    } finally {
      setSubmitLoading(false);
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


  const handleImportFile = async (event) => {
    const file = event.target.files?.[0] || null;
    setImportFile(file);
    setImportMessage('');
    setImportError('');
    if (!file) {
      setImportPreview([]);
      return;
    }
    const text = await file.text();
    setImportPreview(text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 6));
  };

  const handleImportCsv = async () => {
    if (!importFile) {
      setImportMessage('');
      setImportError('Seleziona un file CSV prima di importare.');
      return;
    }

    setImportLoading(true);
    setImportMessage('');
    setImportError('');

    try {
      const out = await api.importMovementsCsv(importFile);
      const errorCount = out.errors?.length || 0;
      setImportMessage(`Import completato: importati ${out.imported}, saltati ${out.skipped}, errori ${errorCount}.`);
      if (errorCount) {
        const topErrors = out.errors.slice(0, 3).map((entry) => `riga ${entry.line}: ${entry.message}`).join(' | ');
        setImportError(`Alcune righe non sono state importate (${topErrors})`);
      }
      await loadMovements(filters);
    } catch (errorImportCsv) {
      setImportError(`Import fallito: ${getErrorMessage(t, errorImportCsv)}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Eliminare definitivamente questo allegato?')) return;
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
    const nextOffset = previousPageAfterDelete({ offset: filters.offset, pageSize: filters.limit, remainingRows: Math.max(0, movements.length - 1) });
    if (nextOffset !== filters.offset) {
      const nextFilters = { ...filters, offset: nextOffset };
      setFilters(nextFilters);
      setDraftFilters(nextFilters);
      await loadMovements(nextFilters);
    } else {
      await loadMovements(filters);
    }
    setAccounts(await api.getAccounts());
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.movements.title')}</h1>
      </div>
      {movementLoadError && <div className="error" role="alert">{movementLoadError} <button type="button" onClick={() => loadMovements(filters)}>Riprova</button></div>}
      {lookupLoadError && <div className="error" role="alert">{lookupLoadError} <button type="button" onClick={loadLookupData}>Riprova</button></div>}
      {pageMessage && <div className="success" aria-live="polite">{pageMessage}</div>}

      <div className="row-actions movements-toolbar">
        {canPermission('write') && (
          <button
            type="button"
            className="primary movements-new-desktop"
            onClick={openNewMovementModal}
          >
            {t('pages.movements.new')}
          </button>
        )}
        <label className="movement-search">
          <span className="sr-only">{t('pages.movements.search')}</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('pages.movements.searchPlaceholder')}
          />
        </label>
        <button
          type="button"
          className="ghost"
          aria-expanded={filtersOpen}
          aria-controls="movement-filters"
          onClick={() => setFiltersOpen((v) => !v)}
        >{t('pages.movements.filters')} {hasActiveFilters ? '(attivi)' : ''}</button>
        {canPermission('export') && <button type="button" className="ghost" onClick={handleExportCsv}>Esporta CSV</button>}
        {canPermission('import_movements') && (
          <details className="movements-import-tools">
            <summary>Importa CSV</summary>
            <div className="row-actions">
              <input type="file" accept=".csv,text/csv" onChange={handleImportFile} />
              <button type="button" className="ghost" onClick={handleImportCsv} disabled={importLoading}>{importLoading ? 'Import in corso...' : 'Importa'}</button>
            </div>
          </details>
        )}
        {!filtersOpen && hasActiveFilters && <button type="button" className="ghost" onClick={resetFilters}>{t('buttons.reset')}</button>}
      </div>

      {importPreview.length > 0 && <div className="card" style={{ fontSize: '0.9rem' }}>CSV selezionato: {importFile?.name}</div>}
      {importError && <div className="error">{importError}</div>}
      {importMessage && <div className="success">{importMessage}</div>}

      {!filtersOpen && hasActiveFilters && (
        <div className="filter-chip-list">
          {activeFilterChips.map((chip) => (
            <button key={chip.key} type="button" className="filter-chip" onClick={() => clearFilterChip(chip.key)} title={t('buttons.reset')}>
              {chip.label} ✕
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={movementModalOpen} onClose={closeMovementModal} dismissible={!submitLoading && !createdMovementId}>
        <div>
          <form onSubmit={handleSubmit}>
            <h2>{editingMovementId ? `${t('buttons.edit')} #${editingMovementId}` : t('pages.movements.new')}</h2>
            <div className="form-grid">
            <label>
              {t('pages.movements.date')}
              <input type="date" value={form.date} onChange={(event) => handleChange('date', event.target.value)} required />
            </label>
            <label>
              {t('pages.movements.type')}
              <select value={form.type} onChange={(event) => handleTypeChange(event.target.value)} required>
                <option value="" disabled>{t('forms.select')}</option>
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
                onKeyDown={(event) => handleAutocompleteKeyDown(event, contactResults, contactActiveIndex, setContactActiveIndex, handleSelectContact, () => setShowContactResults(false))}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showContactResults && contactResults.length > 0}
                aria-controls="movement-contact-results"
                aria-activedescendant={contactActiveIndex >= 0 ? `movement-contact-${contactResults[contactActiveIndex]?.id}` : undefined}
                placeholder={t('placeholders.searchContacts')}
              />
              {showContactResults && contactResults.length > 0 && (
                <div id="movement-contact-results" className="dropdown" role="listbox">
                  {contactResults.map((contact) => (
                    <button
                      id={`movement-contact-${contact.id}`}
                      key={contact.id}
                      type="button"
                      role="option"
                      aria-selected={String(form.contact_id) === String(contact.id) || contactResults[contactActiveIndex]?.id === contact.id}
                      onClick={() => handleSelectContact(contact)}
                    >{contact.name}</button>
                  ))}
                </div>
              )}
            </label>
            {form.type !== 'transfer' && (
              <label>
                {t('pages.movements.category')}
                <select value={form.category_id} onChange={(event) => handleCategoryChange(event.target.value)}>
                  <option value="">{t('common.none')}</option>
                  {movementCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t('pages.movements.property')}
              <select value={form.property_id} onChange={(event) => handleChange('property_id', event.target.value)}>
                <option value="">{t('common.none')}</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t('pages.movements.job')}
              <select value={form.job_id} onChange={(event) => handleChange('job_id', event.target.value)}>
                <option value="">{t('common.none')}</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.name || job.title}</option>
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
          {error && <div className="error" role="alert">{error}</div>}
          {submitMessage && <div aria-live="polite" className={error ? 'error' : 'success'}>{submitMessage}</div>}
            <div className="modal-actions">
              {canPermission('write') && <button type="submit" disabled={submitLoading}>{submitLoading ? t('common.loading') : createdMovementId ? 'Riprova allegato' : editingMovementId ? t('buttons.edit') : t('buttons.save')}</button>}
              <button type="button" className="ghost" onClick={createdMovementId ? finishWithoutAttachment : closeMovementModal} disabled={submitLoading}>
                {createdMovementId ? 'Concludi senza allegato' : t('buttons.cancel')}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <div className="grid-two">
        <div className="card">
          {filtersOpen && (
            <div id="movement-filters" className="filters-drawer">
              <h2>{t('pages.movements.filters')}</h2>
              {hasActiveFilters && <div className="muted">{t('pages.movements.activeFilters')}</div>}
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
                onKeyDown={(event) => handleAutocompleteKeyDown(event, filterContactResults, filterContactActiveIndex, setFilterContactActiveIndex, handleSelectFilterContact, () => setShowFilterContactResults(false))}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showFilterContactResults && filterContactResults.length > 0}
                aria-controls="movement-filter-contact-results"
                aria-activedescendant={filterContactActiveIndex >= 0 ? `movement-filter-contact-${filterContactResults[filterContactActiveIndex]?.id}` : undefined}
                placeholder={t('placeholders.searchContacts')}
              />
              {showFilterContactResults && filterContactResults.length > 0 && (
                <div id="movement-filter-contact-results" className="dropdown" role="listbox">
                  {filterContactResults.map((contact) => (
                    <button
                      id={`movement-filter-contact-${contact.id}`}
                      key={contact.id}
                      type="button"
                      role="option"
                      aria-selected={String(draftFilters.contact_id) === String(contact.id) || filterContactResults[filterContactActiveIndex]?.id === contact.id}
                      onClick={() => handleSelectFilterContact(contact)}
                    >{contact.name}</button>
                  ))}
                </div>
              )}
            </label>
            <label>
              {t('pages.movements.property')}
              <select
                value={draftFilters.property_id}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, property_id: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t('pages.movements.job')}
              <select
                value={draftFilters.job_id}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, job_id: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.name || job.title}</option>
                ))}
              </select>
            </label>
            <label>
              {t('pages.movements.recurrence')}
              <select
                value={draftFilters.is_recurring}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, is_recurring: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                <option value="1">{t('common.yes')}</option>
                <option value="0">{t('common.no')}</option>
              </select>
            </label>
            <label>
              {t('pages.movements.attachments')}
              <select
                value={draftFilters.has_attachments}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, has_attachments: event.target.value }))}
              >
                <option value="">{t('common.all')}</option>
                <option value="1">{t('pages.movements.withAttachments')}</option>
                <option value="0">{t('pages.movements.withoutAttachments')}</option>
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
            <label>
              {t('pages.movements.sort')}
              <select
                value={draftFilters.sort_by}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, sort_by: event.target.value }))}
              >
                <option value="date">{t('pages.movements.sort.date')}</option>
                <option value="amount">{t('pages.movements.sort.amount')}</option>
                <option value="description">{t('pages.movements.sort.description')}</option>
                <option value="type">{t('pages.movements.sort.type')}</option>
              </select>
            </label>
            <label>
              {t('pages.movements.direction')}
              <select
                value={draftFilters.sort_dir}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, sort_dir: event.target.value }))}
              >
                <option value="desc">{t('pages.movements.descending')}</option>
                <option value="asc">{t('pages.movements.ascending')}</option>
              </select>
            </label>
              </div>
              <div className="row-actions">
                <button type="button" onClick={applyFilters}>{t('buttons.apply')}</button>
                <button type="button" className="ghost" onClick={resetFilters}>{t('buttons.reset')}</button>
                {canPermission('export') && <button type="button" className="ghost" onClick={handleExportCsv}>{t('buttons.exportCsv')}</button>}
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
            </div>
          )}

          <div className="movements-list-heading">
            <h2>{t('pages.movements.latest')}</h2>
            <span className="muted" aria-live="polite">
              {movementsLoading ? t('common.loading') : t('pages.movements.results', { count: totalCount })}
            </span>
          </div>

          {movementsLoading && movements.length === 0 && (
            <div className="movements-loading" role="status">{t('common.loading')}</div>
          )}

          {!movementsLoading && movements.length === 0 && (
            <div className="empty-state">
              <h3>{t('pages.movements.emptyTitle')}</h3>
              <p className="muted">{hasActiveFilters ? t('pages.movements.emptyFiltered') : t('pages.movements.emptyDescription')}</p>
              {hasActiveFilters && <button type="button" className="ghost" onClick={resetFilters}>{t('buttons.reset')}</button>}
              {!hasActiveFilters && canPermission('write') && <button type="button" onClick={openNewMovementModal}>{t('pages.movements.new')}</button>}
            </div>
          )}

          {movements.length > 0 && (
            <div className="table-scroll desktop-only">
              <table className="movements-table">
                <thead>
                  <tr>
                    <th>{t('pages.movements.date')}</th>
                    <th>{t('pages.movements.description')}</th>
                    <th>{t('pages.movements.account')}</th>
                    <th>{t('pages.movements.category')}</th>
                    <th>{t('pages.movements.links')}</th>
                    <th className="align-right">{t('pages.movements.amount')}</th>
                    <th><span className="sr-only">{t('pages.movements.details')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => {
                    const attachmentCount = Number(movement.attachment_count || movement.attachments_count || 0);
                    return (
                      <tr key={movement.id}>
                        <td>{formatDateIT(movement.date)}</td>
                        <td>
                          <strong>{movement.description || t(`pages.movements.${movement.type}`)}</strong>
                          <div className="muted">{t(`pages.movements.${movement.type}`)}</div>
                        </td>
                        <td>{formatAccounts(movement.accounts)}</td>
                        <td>{movement.category_name || t('common.none')}</td>
                        <td>
                          {movement.contact_name && <div>{movement.contact_name}</div>}
                          {movement.property_name && <div className="muted">{movement.property_name}</div>}
                          {movement.job_name && <div className="muted">{movement.job_name}</div>}
                          {attachmentCount > 0 && <span className="attachment-indicator" aria-label={`${attachmentCount} ${t('pages.movements.attachments')}`}>📎 {attachmentCount}</span>}
                        </td>
                        <td className={`align-right ${movement.type === 'income' ? 'amount positive' : movement.type === 'expense' ? 'amount negative' : 'amount'}`}>
                          {formatCurrency(movement.amount_total)}
                        </td>
                        <td><button type="button" className="ghost compact-button" onClick={() => setSelected(movement)}>{t('pages.movements.open')}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {movements.length > 0 && (
            <div className="movements-mobile-list mobile-only">
              {movements.map((movement) => {
                const attachmentCount = Number(movement.attachment_count || movement.attachments_count || 0);
                return (
                  <button key={movement.id} type="button" className="movement-mobile-card" onClick={() => setSelected(movement)}>
                    <span className="movement-mobile-main">
                      <span className="movement-mobile-topline">
                        <strong>{movement.description || t(`pages.movements.${movement.type}`)}</strong>
                        <span className={movement.type === 'income' ? 'amount positive' : movement.type === 'expense' ? 'amount negative' : 'amount'}>{formatCurrency(movement.amount_total)}</span>
                      </span>
                      <span className="muted">{formatDateIT(movement.date)} · {formatAccounts(movement.accounts)}</span>
                      <span className="movement-mobile-meta">
                        {movement.category_name && <span>{movement.category_name}</span>}
                        {movement.contact_name && <span>{movement.contact_name}</span>}
                        {movement.property_name && <span>{movement.property_name}</span>}
                        {attachmentCount > 0 && <span aria-label={`${attachmentCount} ${t('pages.movements.attachments')}`}>📎 {attachmentCount}</span>}
                      </span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
          )}
          {totalCount > 0 && <nav className="pagination" aria-label="Paginazione movimenti">
            <button type="button" className="ghost" disabled={filters.offset === 0} onClick={() => { const next = { ...filters, offset: Math.max(0, filters.offset - filters.limit) }; setFilters(next); setDraftFilters(next); loadMovements(next); }}>Precedente</button>
            <span>{totalCount > 0 ? `${filters.offset + 1}–${Math.min(filters.offset + movements.length, totalCount)} / ${totalCount}` : t('pages.movements.noResults')}</span>
            <button type="button" className="ghost" disabled={!hasNextPage} onClick={() => { const next = { ...filters, offset: filters.offset + filters.limit }; setFilters(next); setDraftFilters(next); loadMovements(next); }}>Successiva</button>
          </nav>}
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
          <div>
            <h2>{t('pages.movements.details')}</h2>
            <p><strong>{t('pages.movements.date')}:</strong> {formatDateIT(selected.date)}</p>
            <p><strong>{t('pages.movements.type')}:</strong> {t(`pages.movements.${selected.type}`)}</p>
            <p><strong>{t('pages.movements.amount')}:</strong> {formatCurrency(selected.amount_total)}</p>
            <p><strong>{t('pages.movements.account')}:</strong> {formatAccounts(selected.accounts)}</p>
            <p><strong>{t('pages.movements.category')}:</strong> {selected.category_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.contact')}:</strong> {selected.contact_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.property')}:</strong> {selected.property_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.job')}:</strong> {selected.job_name || t('common.none')}</p>
            <p><strong>{t('pages.movements.description')}:</strong> {selected.description || t('common.none')}</p>
            <p><strong>{t('pages.movements.createdBy')}:</strong> {selected.created_by_name || t('common.none')}</p>
            {selected.recurring_template_title && (
              <p><strong>{t('pages.recurring.badge')}:</strong> {selected.recurring_template_title}</p>
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
                      {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={() => handleDeleteAttachment(item.id)}>{t('buttons.delete')}</button>}
                    </div>
                  </li>
                ))}
              </ul>
              {canPermission('write') && <div className="attachment-upload">
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
              </div>}
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

      {canPermission('write') && (
        <FloatingAddButton onClick={openNewMovementModal} ariaLabel={t('pages.movements.new')} />
      )}
    </div>
  );
};

export default MovementsPage;
