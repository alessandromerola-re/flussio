import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';

const metricOptions = [
  'income_sum_cents',
  'expense_sum_cents',
  'net_sum_cents',
  'count',
  'avg_abs_cents',
];

const groupOptions = ['month', 'day', 'week', 'quarter', 'year', 'category', 'account', 'contact', 'job', 'property', 'type', 'recurring'];

const templates = {
  pnl: {
    name: 'P&L Netto (Entrate/Uscite/Netto)',
    spec: {
      groupBy: ['month'],
      metrics: ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'],
      filters: { type: 'all' },
    },
  },
  income: {
    name: 'Solo Entrate',
    spec: {
      groupBy: ['month'],
      metrics: ['income_sum_cents', 'count'],
      filters: { type: 'income' },
    },
  },
  expense: {
    name: 'Solo Uscite',
    spec: {
      groupBy: ['month'],
      metrics: ['expense_sum_cents', 'count'],
      filters: { type: 'expense' },
    },
  },
};

const defaultDateFrom = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
})();

const baseSpec = {
  dateFrom: defaultDateFrom,
  dateTo: new Date().toISOString().slice(0, 10),
  filters: {
    type: 'all',
    accountId: null,
    categoryId: null,
    includeCategoryChildren: true,
    contactId: null,
    jobId: null,
    propertyId: null,
    text: '',
    isRecurring: null,
    hasAttachments: null,
  },
  groupBy: ['month'],
  metrics: ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count'],
  limit: 200,
};

const formatEuro = (cents) => `€ ${(Number(cents || 0) / 100).toFixed(2)}`;

const AdvancedReportsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [spec, setSpec] = useState(baseSpec);
  const [result, setResult] = useState(null);
  const [savedReports, setSavedReports] = useState([]);
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savedShared, setSavedShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lookups, setLookups] = useState({ accounts: [], categories: [], contacts: [], jobs: [], properties: [] });

  const canExport = canPermission('export');

  const loadLookups = async () => {
    const [accounts, categories, contacts, jobs, properties] = await Promise.all([
      api.getAccounts(),
      api.getCategories(),
      api.getContacts(),
      api.getJobs(),
      api.getProperties(),
    ]);
    setLookups({ accounts, categories, contacts, jobs, properties });
  };

  const loadSaved = async () => {
    const list = await api.listSavedReports();
    setSavedReports(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    const init = async () => {
      const [lookupsResult, savedResult] = await Promise.allSettled([loadLookups(), loadSaved()]);

      if (lookupsResult.status === 'rejected') {
        setError(t('errors.SERVER_ERROR'));
      }

      if (savedResult.status === 'rejected') {
        console.error(savedResult.reason);
      }
    };
    init();
  }, [t]);

  const runReport = async (nextSpec = spec) => {
    setError('');
    setLoading(true);
    try {
      const response = await api.runAdvancedReport(nextSpec);
      setSpec(response.spec);
      setResult(response);
    } catch {
      setError(t('errors.SERVER_ERROR'));
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (templateKey) => {
    const template = templates[templateKey];
    if (!template) return;
    setSpec((prev) => ({
      ...prev,
      ...template.spec,
      filters: { ...prev.filters, ...template.spec.filters },
    }));
  };

  const handleMetricToggle = (metric) => {
    setSpec((prev) => {
      const has = prev.metrics.includes(metric);
      const nextMetrics = has ? prev.metrics.filter((m) => m !== metric) : [...prev.metrics, metric];
      return { ...prev, metrics: nextMetrics.length ? nextMetrics : ['count'] };
    });
  };

  const handleDrilldown = (row) => {
    const params = new URLSearchParams();
    if (spec.dateFrom) params.set('date_from', spec.dateFrom);
    if (spec.dateTo) params.set('date_to', spec.dateTo);
    if (spec.filters.type && spec.filters.type !== 'all') params.set('type', spec.filters.type);
    if (spec.filters.accountId) params.set('account_id', spec.filters.accountId);
    if (spec.filters.categoryId) params.set('category_id', spec.filters.categoryId);
    if (spec.filters.contactId) params.set('contact_id', spec.filters.contactId);
    if (spec.filters.jobId) params.set('job_id', spec.filters.jobId);
    if (spec.filters.propertyId) params.set('property_id', spec.filters.propertyId);
    if (spec.filters.text) params.set('q', spec.filters.text);

    if (row.account_id) params.set('account_id', row.account_id);
    if (row.category_id) params.set('category_id', row.category_id);
    if (row.contact_id) params.set('contact_id', row.contact_id);
    if (row.job_id) params.set('job_id', row.job_id);
    if (row.property_id) params.set('property_id', row.property_id);
    if (row.type) params.set('type', row.type);

    navigate(`/movements?${params.toString()}`);
  };

  const exportCsv = async () => {
    const { blob, headers } = await api.exportAdvancedReportCsv(spec);
    const disposition = headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `flussio_report_advanced_${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const saveReport = async () => {
    if (!savedName.trim()) return;
    const payload = { name: savedName.trim(), spec_json: spec, is_shared: savedShared };
    if (selectedSavedId) {
      await api.updateSavedReport(selectedSavedId, payload);
    } else {
      await api.createSavedReport(payload);
    }
    await loadSaved();
  };

  const loadSavedSpec = async (saved) => {
    setSelectedSavedId(saved.id);
    setSavedName(saved.name);
    setSavedShared(Boolean(saved.is_shared));
    setSpec(saved.spec_json || baseSpec);
    if (saved.spec_json) await runReport(saved.spec_json);
  };

  const deleteSaved = async () => {
    if (!selectedSavedId || !window.confirm(t('modals.confirmDelete'))) return;
    await api.deleteSavedReport(selectedSavedId);
    setSelectedSavedId('');
    setSavedName('');
    setSavedShared(false);
    await loadSaved();
  };

  const rows = result?.rows || [];
  const totals = result?.totals;

  const columns = useMemo(() => {
    const dims = [];
    if (rows[0]?.bucket != null) dims.push('bucket');
    if (rows[0]?.category_name != null) dims.push('category_name');
    if (rows[0]?.account_name != null) dims.push('account_name');
    if (rows[0]?.contact_name != null) dims.push('contact_name');
    if (rows[0]?.job_title != null) dims.push('job_title');
    if (rows[0]?.property_name != null) dims.push('property_name');
    if (rows[0]?.type != null) dims.push('type');
    if (rows[0]?.recurring != null) dims.push('recurring');
    return [...dims, ...spec.metrics];
  }, [rows, spec.metrics]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.reportsAdvanced.title')}</h1>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('pages.reportsAdvanced.templates')}</h2>
        <div className="row-actions">
          {Object.entries(templates).map(([key, tpl]) => (
            <button key={key} type="button" className="ghost" onClick={() => applyTemplate(key)}>{tpl.name}</button>
          ))}
        </div>
      </div>

      <details className="card" open>
        <summary><strong>{t('pages.movements.filters')}</strong></summary>
        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <label>{t('pages.movements.dateFrom')}<input type="date" value={spec.dateFrom || ''} onChange={(e) => setSpec((p) => ({ ...p, dateFrom: e.target.value }))} /></label>
          <label>{t('pages.movements.dateTo')}<input type="date" value={spec.dateTo || ''} onChange={(e) => setSpec((p) => ({ ...p, dateTo: e.target.value }))} /></label>
          <label>{t('pages.movements.type')}
            <select value={spec.filters.type} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, type: e.target.value } }))}>
              <option value="all">{t('common.all')}</option>
              <option value="income">{t('pages.movements.income')}</option>
              <option value="expense">{t('pages.movements.expense')}</option>
              <option value="transfer">{t('pages.movements.transfer')}</option>
            </select>
          </label>
          <label>{t('pages.movements.account')}
            <select value={spec.filters.accountId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, accountId: e.target.value ? Number(e.target.value) : null } }))}>
              <option value="">{t('common.all')}</option>
              {lookups.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>{t('pages.movements.category')}
            <select value={spec.filters.categoryId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, categoryId: e.target.value ? Number(e.target.value) : null } }))}>
              <option value="">{t('common.all')}</option>
              {lookups.categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>{t('pages.movements.contact')}
            <select value={spec.filters.contactId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, contactId: e.target.value ? Number(e.target.value) : null } }))}>
              <option value="">{t('common.all')}</option>
              {lookups.contacts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>{t('pages.movements.job')}
            <select value={spec.filters.jobId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, jobId: e.target.value ? Number(e.target.value) : null } }))}>
              <option value="">{t('common.all')}</option>
              {lookups.jobs.map((x) => <option key={x.id} value={x.id}>{x.title || x.name}</option>)}
            </select>
          </label>
          <label>{t('pages.movements.property')}
            <select value={spec.filters.propertyId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, propertyId: e.target.value ? Number(e.target.value) : null } }))}>
              <option value="">{t('common.all')}</option>
              {lookups.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label>{t('pages.movements.searchText')}<input value={spec.filters.text || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, text: e.target.value } }))} /></label>
          <label>{t('pages.reportsAdvanced.groupBy1')}
            <select value={spec.groupBy[0] || ''} onChange={(e) => setSpec((p) => ({ ...p, groupBy: [e.target.value || '', p.groupBy[1]].filter(Boolean) }))}>
              <option value="">{t('common.none')}</option>
              {groupOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>{t('pages.reportsAdvanced.groupBy2')}
            <select value={spec.groupBy[1] || ''} onChange={(e) => setSpec((p) => ({ ...p, groupBy: [p.groupBy[0], e.target.value || ''].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i) }))}>
              <option value="">{t('common.none')}</option>
              {groupOptions.filter((opt) => opt !== spec.groupBy[0]).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
        </div>

        <div className="row-actions" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
          {metricOptions.map((metric) => (
            <label key={metric} style={{ margin: 0 }}>
              <input type="checkbox" checked={spec.metrics.includes(metric)} onChange={() => handleMetricToggle(metric)} /> {metric}
            </label>
          ))}
        </div>

        <div className="row-actions" style={{ marginTop: '1rem' }}>
          <button type="button" onClick={() => runReport()} disabled={loading}>{t('buttons.runReport')}</button>
          {canExport && <button type="button" className="ghost" onClick={exportCsv}>{t('buttons.exportCsv')}</button>}
        </div>
      </details>

      {canExport && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>{t('pages.reportsAdvanced.savedReports')}</h2>
          <div className="row-actions" style={{ flexWrap: 'wrap' }}>
            <input placeholder={t('pages.reportsAdvanced.savedName')} value={savedName} onChange={(e) => setSavedName(e.target.value)} />
            <label style={{ margin: 0 }}><input type="checkbox" checked={savedShared} onChange={(e) => setSavedShared(e.target.checked)} /> {t('pages.reportsAdvanced.shared')}</label>
            <button type="button" onClick={saveReport}>{t('buttons.saveReport')}</button>
            <button type="button" className="danger" onClick={deleteSaved} disabled={!selectedSavedId}>{t('buttons.delete')}</button>
          </div>
          <ul className="list" style={{ marginTop: '1rem' }}>
            {savedReports.map((item) => (
              <li key={item.id}>
                <button type="button" className="list-item" onClick={() => loadSavedSpec(item)}>
                  <span>{item.name}</span>
                  <small>{item.is_shared ? t('common.yes') : t('common.no')}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>{t('pages.reportsAdvanced.results')}</h2>
          {totals && (
            <div className="row-actions" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span>{t('pages.dashboard.income')}: {formatEuro(totals.income_sum_cents)}</span>
              <span>{t('pages.dashboard.expense')}: {formatEuro(totals.expense_sum_cents)}</span>
              <span>{t('pages.dashboard.net')}: {formatEuro(totals.net_sum_cents)}</span>
              <span>Count: {totals.count}</span>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{columns.map((col) => <th key={col} align={col.includes('cents') || col === 'count' ? 'right' : 'left'}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} onClick={() => handleDrilldown(row)} style={{ cursor: 'pointer' }}>
                  {columns.map((col) => (
                    <td key={col} align={col.includes('cents') || col === 'count' ? 'right' : 'left'}>
                      {col.includes('cents') ? formatEuro(row[col]) : String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={columns.length || 1} className="muted">{t('common.none')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdvancedReportsPage;
