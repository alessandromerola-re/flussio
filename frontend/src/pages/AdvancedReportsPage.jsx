import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { ADV_REPORT_TEMPLATES } from '../utils/advancedReportTemplates.js';

const metricOptions = ['income_sum_cents', 'expense_sum_cents', 'net_sum_cents', 'count', 'avg_abs_cents'];
const groupOptions = ['month', 'day', 'week', 'quarter', 'year', 'category', 'account', 'contact', 'job', 'property', 'type', 'recurring'];
const timeBuckets = new Set(['month', 'day', 'week', 'quarter', 'year']);

const toIsoDate = (date) => date.toISOString().slice(0, 10);
const getLast30Range = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { dateFrom: toIsoDate(from), dateTo: toIsoDate(to) };
};
const getCurrentMonthRange = () => {
  const now = new Date();
  return { dateFrom: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: toIsoDate(now) };
};
const getYtdRange = () => {
  const now = new Date();
  return { dateFrom: toIsoDate(new Date(now.getFullYear(), 0, 1)), dateTo: toIsoDate(now) };
};

const applyPreset = (preset) => {
  if (preset === 'current_month') return getCurrentMonthRange();
  if (preset === 'ytd') return getYtdRange();
  return getLast30Range();
};

const baseSpec = {
  ...getLast30Range(),
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

const dimensionLabelKey = {
  bucket: 'pages.reportsAdvanced.columns.bucket',
  category_name: 'pages.reportsAdvanced.columns.category',
  account_name: 'pages.reportsAdvanced.columns.account',
  contact_name: 'pages.reportsAdvanced.columns.contact',
  job_title: 'pages.reportsAdvanced.columns.job',
  property_name: 'pages.reportsAdvanced.columns.property',
  type: 'pages.reportsAdvanced.columns.type',
  recurring: 'pages.reportsAdvanced.columns.recurring',
};

const toBooleanFilterValue = (value) => {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
};
const toBooleanFilterSelect = (value) => (value === true ? '1' : value === false ? '0' : '');

const formatEuro = (cents) => `€ ${(Number(cents || 0) / 100).toFixed(2)}`;

const rowLabelFromChartX = (row, chartX, t) => {
  if (chartX === 'month' || chartX === 'day' || chartX === 'week' || chartX === 'quarter' || chartX === 'year') return row.bucket || '-';
  if (chartX === 'category') return row.category_name || t('pages.reportsAdvanced.missingCategory');
  if (chartX === 'job') return row.job_title || t('pages.reportsAdvanced.missingJob');
  if (chartX === 'property') return row.property_name || t('pages.reportsAdvanced.missingProperty');
  if (chartX === 'contact') return row.contact_name || t('pages.reportsAdvanced.missingContact');
  if (chartX === 'account') return row.account_name || t('pages.reportsAdvanced.missingAccount');
  if (chartX === 'type') return row.type || '-';
  if (chartX === 'recurring') return row.recurring ? t('pages.reportsAdvanced.recurringYes') : t('pages.reportsAdvanced.recurringNo');
  return row.bucket || row.category_name || row.job_title || '-';
};

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
  const [chartConfig, setChartConfig] = useState({ type: 'line', x: 'month', series: ['net_sum_cents'] });

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
      if (lookupsResult.status === 'rejected') setError(t('errors.SERVER_ERROR'));
      if (savedResult.status === 'rejected') console.error(savedResult.reason);
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

  const applyReadyTemplate = async (template) => {
    const range = applyPreset(template.defaultPreset);
    const nextSpec = {
      ...template.spec,
      dateFrom: template.spec.dateFrom === '__START__' ? range.dateFrom : template.spec.dateFrom,
      dateTo: template.spec.dateTo === '__END__' ? range.dateTo : template.spec.dateTo,
      filters: { ...baseSpec.filters, ...(template.spec.filters || {}) },
      sort: { by: template.tableDefaults.sortBy, dir: template.tableDefaults.sortDir },
      limit: template.tableDefaults.limit,
    };

    setChartConfig(template.chart);
    setSpec(nextSpec);
    await runReport(nextSpec);
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
    if (spec.filters.isRecurring != null) params.set('is_recurring', spec.filters.isRecurring ? '1' : '0');
    if (spec.filters.hasAttachments != null) params.set('has_attachments', spec.filters.hasAttachments ? '1' : '0');

    if (row.account_id) params.set('account_id', row.account_id);
    if (row.category_id) params.set('category_id', row.category_id);
    if (row.contact_id) params.set('contact_id', row.contact_id);
    if (row.job_id) params.set('job_id', row.job_id);
    if (row.property_id) params.set('property_id', row.property_id);
    if (row.type) params.set('type', row.type);
    if (row.recurring != null) params.set('is_recurring', row.recurring ? '1' : '0');

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
    if (selectedSavedId) await api.updateSavedReport(selectedSavedId, payload);
    else await api.createSavedReport(payload);
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
  const groupBy1 = spec.groupBy[0] || '';
  const groupBy2Options = useMemo(
    () => groupOptions.filter((option) => option !== groupBy1 && !(timeBuckets.has(groupBy1) && timeBuckets.has(option))),
    [groupBy1]
  );

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

  const chartRows = useMemo(() => {
    if (!rows.length || !chartConfig?.series?.length) return [];
    const topN = chartConfig.topN || rows.length;
    return rows
      .map((row) => ({
        label: rowLabelFromChartX(row, chartConfig.x, t),
        row,
      }))
      .sort((a, b) => Number(b.row[chartConfig.series[0]] || 0) - Number(a.row[chartConfig.series[0]] || 0))
      .slice(0, topN);
  }, [rows, chartConfig, t]);

  const chartMax = useMemo(() => {
    if (!chartRows.length) return 1;
    return Math.max(
      1,
      ...chartRows.flatMap((entry) => chartConfig.series.map((series) => Math.abs(Number(entry.row[series] || 0))))
    );
  }, [chartRows, chartConfig]);

  const renderGroupOptionLabel = (value) => t(`pages.reportsAdvanced.groupOptions.${value}`, value);
  const renderMetricLabel = (value) => t(`pages.reportsAdvanced.metrics.${value}`, value);
  const renderColumnLabel = (value) => (value.includes('cents') || value === 'count' ? renderMetricLabel(value) : t(dimensionLabelKey[value] || value, value));

  return (
    <div className="page">
      <div className="page-header"><h1>{t('pages.reportsAdvanced.title')}</h1></div>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>{t('pages.reportsAdvanced.readyReports')}</h2>
        <div className="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '0.75rem' }}>
          {ADV_REPORT_TEMPLATES.map((template) => (
            <button key={template.key} type="button" className="list-item" onClick={() => applyReadyTemplate(template)} style={{ textAlign: 'left' }}>
              <strong>{t(template.titleKey)}</strong>
              <small style={{ display: 'block' }}>{t(template.descriptionKey)}</small>
              <small className="muted">{t('pages.reportsAdvanced.chartType')}: {t(`pages.reportsAdvanced.chartTypes.${template.chart.type}`)}</small>
            </button>
          ))}
        </div>
      </div>

      {!!chartRows.length && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2>{t('pages.reportsAdvanced.chartPreview')}</h2>
          {(chartConfig.type === 'pie' || chartConfig.type === 'stacked_bar') && (
            <p className="muted">{t('pages.reportsAdvanced.chartFallbackNote')}</p>
          )}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {chartRows.map((entry) => (
              <div key={entry.label} style={{ display: 'grid', gap: '0.25rem' }}>
                <strong>{entry.label}</strong>
                {chartConfig.series.map((series) => {
                  const value = Number(entry.row[series] || 0);
                  const width = Math.max(2, (Math.abs(value) / chartMax) * 100);
                  return (
                    <div key={series} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 120px', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{renderMetricLabel(series)}</span>
                      <div style={{ height: 10, background: '#eef2ff' }}><div style={{ width: `${width}%`, height: '100%', background: '#6366f1' }} /></div>
                      <span style={{ textAlign: 'right' }}>{series.includes('cents') ? formatEuro(value) : value}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="report-layout">
      <details className="card" open>
        <summary><strong>{t('pages.movements.filters')}</strong></summary>
        <div className="row-actions" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={() => setSpec((p) => ({ ...p, ...getCurrentMonthRange() }))}>{t('pages.reportsAdvanced.datePresets.currentMonth')}</button>
          <button type="button" className="ghost" onClick={() => setSpec((p) => ({ ...p, ...getLast30Range() }))}>{t('pages.reportsAdvanced.datePresets.last30Days')}</button>
          <button type="button" className="ghost" onClick={() => setSpec((p) => ({ ...p, ...getYtdRange() }))}>{t('pages.reportsAdvanced.datePresets.currentYear')}</button>
        </div>

        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <label>{t('pages.movements.dateFrom')}<input type="date" value={spec.dateFrom || ''} onChange={(e) => setSpec((p) => ({ ...p, dateFrom: e.target.value }))} /></label>
          <label>{t('pages.movements.dateTo')}<input type="date" value={spec.dateTo || ''} onChange={(e) => setSpec((p) => ({ ...p, dateTo: e.target.value }))} /></label>
          <label>{t('pages.movements.type')}<select value={spec.filters.type} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, type: e.target.value } }))}><option value="all">{t('common.all')}</option><option value="income">{t('pages.movements.income')}</option><option value="expense">{t('pages.movements.expense')}</option><option value="transfer">{t('pages.movements.transfer')}</option></select></label>
          <label>{t('pages.movements.account')}<select value={spec.filters.accountId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, accountId: e.target.value ? Number(e.target.value) : null } }))}><option value="">{t('common.all')}</option>{lookups.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.category')}<select value={spec.filters.categoryId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, categoryId: e.target.value ? Number(e.target.value) : null } }))}><option value="">{t('common.all')}</option>{lookups.categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.contact')}<select value={spec.filters.contactId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, contactId: e.target.value ? Number(e.target.value) : null } }))}><option value="">{t('common.all')}</option>{lookups.contacts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.job')}<select value={spec.filters.jobId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, jobId: e.target.value ? Number(e.target.value) : null } }))}><option value="">{t('common.all')}</option>{lookups.jobs.map((x) => <option key={x.id} value={x.id}>{x.title || x.name}</option>)}</select></label>
          <label>{t('pages.movements.property')}<select value={spec.filters.propertyId || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, propertyId: e.target.value ? Number(e.target.value) : null } }))}><option value="">{t('common.all')}</option>{lookups.properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>{t('pages.movements.searchText')}<input value={spec.filters.text || ''} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, text: e.target.value } }))} /></label>
          <label>{t('pages.reportsAdvanced.recurring')}<select value={toBooleanFilterSelect(spec.filters.isRecurring)} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, isRecurring: toBooleanFilterValue(e.target.value) } }))}><option value="">{t('common.all')}</option><option value="1">{t('common.yes')}</option><option value="0">{t('common.no')}</option></select></label>
          <label>{t('pages.reportsAdvanced.hasAttachments')}<select value={toBooleanFilterSelect(spec.filters.hasAttachments)} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, hasAttachments: toBooleanFilterValue(e.target.value) } }))}><option value="">{t('common.all')}</option><option value="1">{t('common.yes')}</option><option value="0">{t('common.no')}</option></select></label>
          <label>{t('pages.reportsAdvanced.groupBy1')}<select value={spec.groupBy[0] || ''} onChange={(e) => setSpec((p) => ({ ...p, groupBy: [e.target.value || '', p.groupBy[1]].filter(Boolean) }))}><option value="">{t('common.none')}</option>{groupOptions.map((opt) => <option key={opt} value={opt}>{renderGroupOptionLabel(opt)}</option>)}</select></label>
          <label>{t('pages.reportsAdvanced.groupBy2')}<select value={spec.groupBy[1] || ''} onChange={(e) => setSpec((p) => ({ ...p, groupBy: [p.groupBy[0], e.target.value || ''].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i) }))}><option value="">{t('common.none')}</option>{groupBy2Options.map((opt) => <option key={opt} value={opt}>{renderGroupOptionLabel(opt)}</option>)}</select></label>
        </div>

        {spec.filters.categoryId && <div className="row-actions" style={{ marginTop: '1rem' }}><label style={{ margin: 0 }}><input type="checkbox" checked={Boolean(spec.filters.includeCategoryChildren)} onChange={(e) => setSpec((p) => ({ ...p, filters: { ...p.filters, includeCategoryChildren: e.target.checked } }))} /> {t('pages.reportsAdvanced.includeCategoryChildren')}</label></div>}

        <div className="row-actions" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>{metricOptions.map((metric) => <label key={metric} style={{ margin: 0 }}><input type="checkbox" checked={spec.metrics.includes(metric)} onChange={() => handleMetricToggle(metric)} /> {renderMetricLabel(metric)}</label>)}</div>

        <div className="row-actions" style={{ marginTop: '1rem' }}><button type="button" onClick={() => runReport()} disabled={loading}>{t('buttons.runReport')}</button>{canExport && <button type="button" className="ghost" onClick={exportCsv}>{t('buttons.exportCsv')}</button>}</div>
      </details>

      {canExport && <div className="card" style={{ marginTop: '1rem' }}><h2>{t('pages.reportsAdvanced.savedReports')}</h2><div className="row-actions" style={{ flexWrap: 'wrap' }}><input placeholder={t('pages.reportsAdvanced.savedName')} value={savedName} onChange={(e) => setSavedName(e.target.value)} /><label style={{ margin: 0 }}><input type="checkbox" checked={savedShared} onChange={(e) => setSavedShared(e.target.checked)} /> {t('pages.reportsAdvanced.shared')}</label><button type="button" onClick={saveReport}>{t('buttons.saveReport')}</button><button type="button" className="danger" onClick={deleteSaved} disabled={!selectedSavedId}>{t('buttons.delete')}</button></div><ul className="list" style={{ marginTop: '1rem' }}>{savedReports.map((item) => <li key={item.id}><button type="button" className="list-item" onClick={() => loadSavedSpec(item)}><span>{item.name}</span><small>{item.is_shared ? t('common.yes') : t('common.no')}</small></button></li>)}</ul></div>}

      {result && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>{t('pages.reportsAdvanced.results')}</h2>
          {totals && <div className="row-actions" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}><span>{t('pages.dashboard.income')}: {formatEuro(totals.income_sum_cents)}</span><span>{t('pages.dashboard.expense')}: {formatEuro(totals.expense_sum_cents)}</span><span>{t('pages.dashboard.net')}: {formatEuro(totals.net_sum_cents)}</span><span>{t('pages.reportsAdvanced.metrics.count')}: {totals.count}</span></div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{columns.map((col) => <th key={col} align={col.includes('cents') || col === 'count' ? 'right' : 'left'}>{renderColumnLabel(col)}</th>)}</tr></thead><tbody>{rows.map((row, idx) => <tr key={idx} onClick={() => handleDrilldown(row)} style={{ cursor: 'pointer', backgroundColor: row.category_id == null ? '#fff7ed' : undefined }}>{columns.map((col) => <td key={col} align={col.includes('cents') || col === 'count' ? 'right' : 'left'}>{col.includes('cents') ? formatEuro(row[col]) : String(row[col] ?? '')}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={columns.length || 1} className="muted">{t('common.none')}</td></tr>}</tbody></table>
        </div>
      )}
      </div>
    </div>
  );
};

export default AdvancedReportsPage;
