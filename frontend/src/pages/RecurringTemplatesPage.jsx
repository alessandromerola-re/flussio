import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import Modal from '../components/Modal.jsx';
import RecurringHistory from '../components/RecurringHistory.jsx';
import { formatTimestampDateIT, formatDateInTimeZone } from '../utils/date.js';
import FloatingAddButton from '../components/FloatingAddButton.jsx';
import { getErrorMessage } from '../utils/errorMessages.js';
import { formatCurrency } from '../utils/currency.js';

const initialForm = {
  title: '',
  frequency: 'monthly',
  interval: 1,
  start_date: '',
  end_date: '',
  amount: '',
  movement_type: 'expense',
  account_id: '',
  category_id: '',
  contact_id: '',
  property_id: '',
  job_id: '',
  notes: '',
  is_active: true,
  weekly_anchor_dow: 1,
  yearly_anchor_mm: 1,
  yearly_anchor_dd: 1,
};

const RecurringTemplatesPage = () => {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [history, setHistory] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [generatorEnabled, setGeneratorEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const requestId = useRef(0);
  const [templates, setTemplates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [pendingTemplateId, setPendingTemplateId] = useState(null);

  const loadData = async () => {
    const request = ++requestId.current;
    setLoading(true); setLoadError(null);
    try {
      const [templatesData, categoriesData, contactsData, propertiesData, jobsData, accountsData, generator] = await Promise.all([
        api.getRecurringTemplates(), api.getCategories(), api.getContacts(), api.getProperties(),
        api.getJobs({ active: 0, include_closed: 1 }), api.getAccounts(), api.getRecurringStatus(),
      ]);
      if (request !== requestId.current) return;
      setTemplates(templatesData); setCategories(categoriesData); setContacts(contactsData);
      setProperties(propertiesData); setJobs(jobsData); setAccounts(accountsData);
      setGeneratorEnabled(generator.generator_enabled === true);
    } catch (failure) { if (request === requestId.current) setLoadError(failure); }
    finally { if (request === requestId.current) setLoading(false); }
  };

  useEffect(() => {
    loadData();
    return () => { requestId.current += 1; };
  }, []);

  const runAction = async (action) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (failure) { setError(getErrorMessage(t, failure)); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const openNew = () => {
    setEditingId(null); setForm({ ...initialForm, start_date: formatDateInTimeZone(new Date()) });
    setError(''); setMessage(''); setShowForm(true);
  };
  const visibleTemplates = templates.filter((item) => {
    const incomplete = !item.account_id || !item.account_name || item.account_is_active === false;
    const matchesStatus = status === 'all' || (status === 'active' && item.is_active) || (status === 'inactive' && !item.is_active) || (status === 'incomplete' && incomplete);
    return matchesStatus && [item.title, item.account_name, item.contact_name, item.property_name, item.job_title].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = {
      ...form,
      interval: Number(form.interval),
      amount: Number(form.amount),
      account_id: form.account_id ? Number(form.account_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      property_id: form.property_id ? Number(form.property_id) : null,
      job_id: form.job_id ? Number(form.job_id) : null,
      weekly_anchor_dow: form.frequency === 'weekly' ? Number(form.weekly_anchor_dow) : null,
      yearly_anchor_mm: form.frequency === 'yearly' ? Number(form.yearly_anchor_mm) : null,
      yearly_anchor_dd: form.frequency === 'yearly' ? Number(form.yearly_anchor_dd) : null,
    };

    try {
      if (editingId) {
        await api.updateRecurringTemplate(editingId, payload);
      } else {
        await api.createRecurringTemplate(payload);
      }
      await loadData();
      resetForm();
      setMessage(t('pages.recurring.saveSuccess'));
    } catch (saveError) {
      setError(getErrorMessage(t, saveError));
    }
  };

  const handleGenerateNow = async (id) => {
    try {
      const result = await api.generateRecurringTemplateNow(id);
      if (result.status === 'skipped') {
        setMessage(t('pages.recurring.skipped'));
      } else {
        setMessage(t('pages.recurring.generated'));
      }
      await loadData();
    } catch (generateError) {
      setError(getErrorMessage(t, generateError));
    }
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
    try {
      const blob = await api.exportEntityCsv('recurring_templates');
      downloadBlob(blob, 'recurring_templates.csv');
    } catch (exportError) {
      setError(getErrorMessage(t, exportError));
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0] || null;
    setImportFile(file);
    if (!file) {
      setImportPreview([]);
      return;
    }
    const text = await file.text();
    setImportPreview(text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 6));
  };

  const handleImportCsv = async () => {
    if (!importFile) return;
    try {
      const out = await api.importEntityCsv('recurring_templates', importFile);
      setMessage(`OK: ${out.ok} | creati: ${out.created} | aggiornati: ${out.updated} | errori: ${out.errors}`);
      await loadData();
    } catch (importError) {
      setError(getErrorMessage(t, importError));
    }
  };

  const handleGenerateDue = async () => {
    try {
      const result = await api.generateRecurringDue();
      setMessage(`${t('pages.recurring.generatedDue')}: ${result.created_count} / ${result.skipped_count}`);
      await loadData();
    } catch (generateError) {
      setError(getErrorMessage(t, generateError));
    }
  };

  const handleActiveChange = async (template) => {
    const nextActive = !template.is_active;
    setPendingTemplateId(template.id);
    setError('');
    setTemplates((current) => current.map((item) => item.id === template.id ? { ...item, is_active: nextActive } : item));
    try {
      const updated = await api.setRecurringTemplateActive(template.id, nextActive);
      setTemplates((current) => current.map((item) => item.id === template.id ? { ...item, ...updated } : item));
      setMessage(nextActive ? 'Ricorrenza attivata.' : 'Ricorrenza disattivata.');
    } catch (activeError) {
      setTemplates((current) => current.map((item) => item.id === template.id ? { ...item, is_active: template.is_active } : item));
      setError(getErrorMessage(t, activeError));
    } finally {
      setPendingTemplateId(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.recurring.title')}</h1>
      </div>

      {message && <div className="success" aria-live="polite">{message}</div>}
      {error && !showForm && <div className="error" role="alert">{error}</div>}

      {!loading && !loadError && <p className="card" role="status">{t(generatorEnabled ? 'pages.recurring.generatorOn' : 'pages.recurring.generatorOff')}</p>}
      {loading && <p role="status">{t('common.loading')}</p>}
      {loadError && <div role="alert" className="error">{getErrorMessage(t, loadError)} <button onClick={loadData}>{t('buttons.retry')}</button></div>}
      <div className="row-actions" style={{ marginBottom: '1rem' }}>
        {canPermission('write') && <button type="button" disabled={busy || loading || Boolean(loadError) || !generatorEnabled} onClick={() => { if (window.confirm(t('pages.recurring.confirmGenerate'))) runAction(handleGenerateDue); }}>{t('buttons.generateDue')}</button>}
        {canPermission('export') && <button type="button" className="ghost" disabled={busy} onClick={() => runAction(handleExportCsv)}>Esporta CSV</button>}
        {canPermission('import') && <input type="file" accept=".csv,text/csv" onChange={handleImportFile} />}
        {canPermission('import') && <button type="button" className="ghost" onClick={() => runAction(handleImportCsv)} disabled={!importFile || busy}>Importa CSV</button>}
      </div>
      {importPreview.length > 0 && <pre className="card" style={{ maxHeight: 140, overflow: 'auto' }}>{importPreview.join('\n')}</pre>}

      {canPermission('write') && <button type="button" disabled={loading || Boolean(loadError) || busy} onClick={openNew}>{t('buttons.new')}</button>}
      <section className="card recurring-filters" aria-label={t('pages.recurring.filters')}>
        <label>{t('forms.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>{t('pages.registry.status')}<select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t('common.all')}</option><option value="active">{t('labels.active')}</option><option value="inactive">{t('labels.inactive')}</option><option value="incomplete">{t('pages.recurring.incomplete')}</option>
        </select></label><span aria-live="polite">{visibleTemplates.length} / {templates.length}</span>
      </section>
      <Modal isOpen={showForm && canPermission('write')} onClose={() => setShowForm(false)} dismissible={!busy} title={editingId ? t('buttons.edit') : t('buttons.new')}>
        <form onSubmit={(event) => { event.preventDefault(); runAction(() => handleSave(event)); }}>
          {error && <p className="error" role="alert">{error}</p>}
          <fieldset disabled={busy} className="recurring-fieldset">
          <h2>{editingId ? t('buttons.edit') : t('buttons.new')}</h2>
          <label>
            {t('forms.name')}
            <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required />
          </label>
          <label>
            {t('forms.frequency')}
            <select
              value={form.frequency}
              onChange={(event) => setForm((prev) => ({ ...prev, frequency: event.target.value }))}
            >
              <option value="weekly">{t('pages.recurring.weekly')}</option>
              <option value="monthly">{t('pages.recurring.monthly')}</option>
              <option value="yearly">{t('pages.recurring.yearly')}</option>
            </select>
          </label>
          <label>
            {t('forms.interval')}
            <input type="number" min="1" value={form.interval} onChange={(event) => setForm((prev) => ({ ...prev, interval: event.target.value }))} required />
          </label>
          {form.frequency === 'monthly' && <div className="muted">{t('pages.recurring.monthlyHint')}</div>}
          {form.frequency === 'weekly' && (
            <label>
              {t('forms.weekday')}
              <select value={form.weekly_anchor_dow} onChange={(event) => setForm((prev) => ({ ...prev, weekly_anchor_dow: event.target.value }))}>
                <option value={1}>Mon</option><option value={2}>Tue</option><option value={3}>Wed</option><option value={4}>Thu</option>
                <option value={5}>Fri</option><option value={6}>Sat</option><option value={7}>Sun</option>
              </select>
            </label>
          )}
          {form.frequency === 'yearly' && (
            <div className="form-grid">
              <label>{t('forms.month')}<input type="number" min="1" max="12" value={form.yearly_anchor_mm} onChange={(event) => setForm((prev) => ({ ...prev, yearly_anchor_mm: event.target.value }))} /></label>
              <label>{t('forms.day')}<input type="number" min="1" max="31" value={form.yearly_anchor_dd} onChange={(event) => setForm((prev) => ({ ...prev, yearly_anchor_dd: event.target.value }))} /></label>
            </div>
          )}
          <label>{t('pages.movements.amount')}<input type="number" step="0.01" min="0.01" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} required /></label>
          <label>{t('pages.movements.type')}<select value={form.movement_type} onChange={(event) => setForm((prev) => ({ ...prev, movement_type: event.target.value }))}><option value="income">{t('pages.movements.income')}</option><option value="expense">{t('pages.movements.expense')}</option></select></label>
          <label>{t('pages.movements.account')}<select value={form.account_id} onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))} required><option value="">{t('pages.recurring.selectAccount')}</option>{accounts.filter((x) => x.is_active !== false || String(x.id) === String(form.account_id)).map((x)=><option key={x.id} value={x.id} disabled={x.is_active === false}>{x.name}{x.is_active === false ? ` (${t('labels.inactive')})` : ''}</option>)}</select></label>
          <label>{t('pages.movements.dateFrom')}<input required type="date" value={form.start_date} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} /></label>
          <label>{t('pages.movements.dateTo')}<input min={form.start_date || undefined} type="date" value={form.end_date} onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))} /></label>
          <label>{t('pages.movements.category')}<select value={form.category_id} onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}><option value="">{t('common.none')}</option>{categories.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.contact')}<select value={form.contact_id} onChange={(event) => setForm((prev) => ({ ...prev, contact_id: event.target.value }))}><option value="">{t('common.none')}</option>{contacts.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.registry.properties')}<select value={form.property_id} onChange={(event) => setForm((prev) => ({ ...prev, property_id: event.target.value }))}><option value="">{t('common.none')}</option>{properties.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.job')}<select value={form.job_id} onChange={(event) => setForm((prev) => ({ ...prev, job_id: event.target.value }))}><option value="">{t('common.none')}</option>{jobs.map((x)=><option key={x.id} value={x.id}>{x.title || x.name}</option>)}</select></label>
          <label>{t('forms.notes')}<input value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
          <button type="submit">{busy ? t('common.loading') : t('buttons.save')}</button>
          </fieldset>
        </form>
      </Modal>

        {!loading && !loadError && <div className="card">
          <h2>{t('pages.recurring.list')}</h2>
          <ul className="list">
            {visibleTemplates.map((template) => (
              <li key={template.id} className="list-item-row">
                <div>
                  <strong>{template.title}</strong>
                  <div className="muted">{t(`pages.recurring.${template.frequency}`)} · {t('forms.interval')}: {template.interval}</div>
                  <div className="muted">{t('pages.movements.amount')}: {formatCurrency(template.amount)}</div>
                  <div className="muted">{t('pages.movements.account')}: {template.account_name || t('pages.recurring.accountMissing')}</div>
                  <div className="muted">{t('pages.recurring.nextRun')}: {formatTimestampDateIT(template.next_run_at) || t('common.notSet')}</div>
                  <span className="badge">{t(template.is_active ? 'labels.active' : 'labels.inactive')}</span>
                  {(!template.account_id || !template.account_name || template.account_is_active === false) && <p className="error">{t('pages.recurring.incompleteHint')}</p>}
                  {template.recurring_template_id && <div className="muted">#{template.recurring_template_id}</div>}
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => setHistory(template)}>{t('pages.recurring.history')}</button>
                  <Link to={`/movements?recurring_template_id=${template.id}`}>{t('nav.movements')}</Link>
                  {canPermission('write') && <button
                    type="button"
                    className="ghost" disabled={busy}
                    onClick={() => {
                      setError(''); setShowForm(true);
                      setEditingId(template.id);
                      setForm({
                        title: template.title || '',
                        frequency: template.frequency,
                        interval: template.interval,
                        start_date: template.start_date ? String(template.start_date).slice(0, 10) : '',
                        end_date: template.end_date ? String(template.end_date).slice(0, 10) : '',
                        amount: template.amount,
                        movement_type: template.movement_type,
                        account_id: template.account_id || '',
                        category_id: template.category_id || '',
                        contact_id: template.contact_id || '',
                        property_id: template.property_id || '',
                        job_id: template.job_id || '',
                        notes: template.notes || '',
                        is_active: template.is_active,
                        weekly_anchor_dow: template.weekly_anchor_dow || 1,
                        yearly_anchor_mm: template.yearly_anchor_mm || 1,
                        yearly_anchor_dd: template.yearly_anchor_dd || 1,
                      });
                    }}
                  >
                    {t('buttons.edit')}
                  </button>}
                  {canPermission('write') && <button type="button" className="ghost" disabled={busy || !generatorEnabled || !template.is_active || !template.account_id || template.account_is_active === false} onClick={() => { if (window.confirm(t('pages.recurring.confirmGenerate'))) runAction(() => handleGenerateNow(template.id)); }}>{t('buttons.generateNow')}</button>}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" disabled={busy} onClick={() => runAction(() => handleActiveChange(template))}>
                    {pendingTemplateId === template.id ? t('common.loading') : template.is_active ? t('buttons.deactivate') : t('buttons.activate')}
                  </button>}
                </div>
              </li>
            ))}
          </ul>
          {!visibleTemplates.length && <p>{t(templates.length ? 'pages.registry.noResults' : 'pages.recurring.empty')}</p>}
        </div>}
      {history && <RecurringHistory key={history.id} template={history} onClose={() => setHistory(null)} />}
      {canPermission('write') && !showForm && !loading && !loadError && !busy && <FloatingAddButton onClick={openNew} ariaLabel={t('buttons.new')} />}
    </div>
  );
};

export default RecurringTemplatesPage;
