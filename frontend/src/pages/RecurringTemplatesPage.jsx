import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, canPermission } from '../services/api.js';

const initialForm = {
  title: '',
  frequency: 'monthly',
  interval: 1,
  start_date: '',
  end_date: '',
  amount: '',
  movement_type: 'expense',
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

  const loadData = async () => {
    const [templatesData, categoriesData, contactsData, propertiesData, jobsData, accountsData] = await Promise.all([
      api.getRecurringTemplates(),
      api.getCategories(),
      api.getContacts(),
      api.getProperties(),
      api.getJobs({ active: 0, include_closed: 1 }),
      api.getAccounts(),
    ]);
    setTemplates(templatesData);
    setCategories(categoriesData);
    setContacts(contactsData);
    setProperties(propertiesData);
    setJobs(jobsData);
    setAccounts(accountsData);
  };

  useEffect(() => {
    loadData().catch(() => setError(t('errors.SERVER_ERROR')));
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = {
      ...form,
      interval: Number(form.interval),
      amount: Number(form.amount),
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
      setError(t(`errors.${saveError.code || 'SERVER_ERROR'}`));
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
      setError(t(`errors.${generateError.code || 'SERVER_ERROR'}`));
    }
  };

  const handleGenerateDue = async () => {
    try {
      const result = await api.generateRecurringDue();
      setMessage(`${t('pages.recurring.generatedDue')}: ${result.created_count} / ${result.skipped_count}`);
      await loadData();
    } catch (generateError) {
      setError(t(`errors.${generateError.code || 'SERVER_ERROR'}`));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.recurring.title')}</h1>
      </div>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="row-actions" style={{ marginBottom: '1rem' }}>
        {canPermission('write') && <button type="button" onClick={handleGenerateDue}>{t('buttons.generateDue')}</button>}
      </div>

      <div className="grid-two">
        <form className="card" onSubmit={handleSave}>
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
          <label>{t('pages.movements.dateFrom')}<input type="date" value={form.start_date} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} /></label>
          <label>{t('pages.movements.dateTo')}<input type="date" value={form.end_date} onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))} /></label>
          <label>{t('pages.movements.category')}<select value={form.category_id} onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}><option value="">{t('common.none')}</option>{categories.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.contact')}<select value={form.contact_id} onChange={(event) => setForm((prev) => ({ ...prev, contact_id: event.target.value }))}><option value="">{t('common.none')}</option>{contacts.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.registry.propertiesBeta')}<select value={form.property_id} onChange={(event) => setForm((prev) => ({ ...prev, property_id: event.target.value }))}><option value="">{t('common.none')}</option>{properties.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.job')}<select value={form.job_id} onChange={(event) => setForm((prev) => ({ ...prev, job_id: event.target.value }))}><option value="">{t('common.none')}</option>{jobs.map((x)=><option key={x.id} value={x.id}>{x.title || x.name}</option>)}</select></label>
          <label>{t('forms.notes')}<input value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
          {canPermission('write') && <button type="submit">{t('buttons.save')}</button>}
        </form>

        <div className="card">
          <h2>{t('pages.recurring.list')}</h2>
          <ul className="list">
            {templates.map((template) => (
              <li key={template.id} className="list-item-row">
                <div>
                  <strong>{template.title}</strong>
                  <div className="muted">{template.frequency} · {template.interval}</div>
                  <div className="muted">{t('pages.movements.amount')}: € {Number(template.amount).toFixed(2)}</div>
                  <div className="muted">next: {template.next_run_at}</div>
                  {template.recurring_template_id && <div className="muted">#{template.recurring_template_id}</div>}
                </div>
                <div className="row-actions">
                  {canPermission('write') && <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setEditingId(template.id);
                      setForm({
                        title: template.title || '',
                        frequency: template.frequency,
                        interval: template.interval,
                        start_date: template.start_date ? String(template.start_date).slice(0, 10) : '',
                        end_date: template.end_date ? String(template.end_date).slice(0, 10) : '',
                        amount: template.amount,
                        movement_type: template.movement_type,
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
                  {canPermission('write') && <button type="button" className="ghost" onClick={() => handleGenerateNow(template.id)}>{t('buttons.generateNow')}</button>}
                  {canPermission('delete_sensitive') && <button type="button" className="danger" onClick={async () => {
                    await api.deleteRecurringTemplate(template.id);
                    await loadData();
                  }}>{template.is_active ? t('buttons.deactivate') : t('buttons.activate')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>{t('pages.recurring.movementLinks')}</h2>
        <div className="muted">{t('pages.recurring.movementLinksHint')}</div>
        {accounts.length > 0 && <div className="muted">{t('pages.recurring.accountsLoaded')}: {accounts.length}</div>}
        <Link to="/movements">{t('nav.movements')}</Link>
      </div>
    </div>
  );
};

export default RecurringTemplatesPage;
