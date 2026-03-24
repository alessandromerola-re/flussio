import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { formatCurrencyFromCents } from '../utils/currency.js';

const defaultFilters = {
  date_from: '',
  date_to: '',
};

const formatCurrencyOrNotSet = (value, fallback) => formatCurrencyFromCents(value) || fallback;
const formatPctOrNotSet = (value, fallback) => (value == null ? fallback : `${Number(value).toFixed(2)}%`);
const varianceClass = (value) => {
  if (value == null || value === 0) return '';
  return value > 0 ? 'positive' : 'negative';
};

const JobDetailPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();

  const [job, setJob] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async (nextFilters = filters) => {
    setLoading(true);
    setError('');
    try {
      const [jobData, summaryData] = await Promise.all([
        api.getJob(id),
        api.getJobReportSummary(id, nextFilters),
      ]);
      setJob(jobData);
      setSummary(summaryData);
    } catch {
      setError(t('errors.SERVER_ERROR'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(defaultFilters);
  }, [id]);

  const statusLabel = useMemo(() => {
    if (!job) {
      return '';
    }
    return job.is_closed ? t('labels.jobClosed') : t('labels.jobOpen');
  }, [job, t]);

  const handleApplyFilters = async () => {
    await loadData(filters);
  };

  const handleExport = async () => {
    const { blob, headers } = await api.exportJobReportCsv(id, filters);
    const disposition = headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `flussio_commessa_${id}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      {loading && <div className="muted">{t('common.loading')}</div>}
      {error && <div className="error">{error}</div>}

      {!loading && job && summary && (
        <>
          <div className="page-header">
            <h1>
              {job.title} {job.code ? `(${job.code})` : ''}
            </h1>
            <span className={`badge ${job.is_closed ? 'badge-neutral' : 'badge-positive'}`}>{statusLabel}</span>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2>{t('pages.jobs.headerTitle')}</h2>
            <div className="form-grid">
              <div><strong>{t('forms.jobCode')}:</strong> {job.code || t('common.notSet')}</div>
              <div><strong>{t('forms.jobTitle')}:</strong> {job.title || t('common.notSet')}</div>
              <div><strong>{t('forms.jobStatus')}:</strong> {statusLabel}</div>
              <div><strong>{t('forms.referenceContact')}:</strong> {job.contact_name || t('common.notSet')}</div>
              <div><strong>{t('forms.jobStartDate')}:</strong> {job.start_date || t('common.notSet')}</div>
              <div><strong>{t('forms.jobEndDate')}:</strong> {job.end_date || t('common.notSet')}</div>
              <div className="full"><strong>{t('forms.notes')}:</strong> {job.notes || t('common.notSet')}</div>
            </div>
            <div className="row-actions" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => navigate(`/movements?job_id=${job.id}`)}>
                {t('buttons.goToMovements')}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2>{t('pages.jobs.reportTitle')}</h2>
            <div className="form-grid">
              <label>
                {t('pages.movements.dateFrom')}
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(event) => setFilters((prev) => ({ ...prev, date_from: event.target.value }))}
                />
              </label>
              <label>
                {t('pages.movements.dateTo')}
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(event) => setFilters((prev) => ({ ...prev, date_to: event.target.value }))}
                />
              </label>
            </div>
            <div className="row-actions">
              <button type="button" onClick={handleApplyFilters}>{t('buttons.apply')}</button>
              {canPermission('export') && <button type="button" className="ghost" onClick={handleExport}>{t('buttons.exportJobCsv')}</button>}
            </div>
          </div>

          <div className="grid-two">
            <div className="card">
              <h3>{t('pages.jobs.expectedSection')}</h3>
              <div>{t('pages.jobs.expectedRevenue')}: <strong>{formatCurrencyOrNotSet(job.expectedRevenueCents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.expectedCost')}: <strong>{formatCurrencyOrNotSet(job.expectedCostCents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.expectedMargin')}: <strong>{formatCurrencyOrNotSet(job.expectedMarginCents, t('common.notSet'))}</strong></div>
            </div>
            <div className="card">
              <h3>{t('pages.jobs.actualSection')}</h3>
              <div>{t('pages.jobs.totalIncome')}: <strong>{formatCurrencyOrNotSet(job.totalIncomeCents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.totalExpense')}: <strong>{formatCurrencyOrNotSet(job.totalExpenseCents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.actualMargin')}: <strong>{formatCurrencyOrNotSet(job.actualMarginCents, t('common.notSet'))}</strong></div>
            </div>
            <div className="card">
              <h3>{t('pages.jobs.varianceSection')}</h3>
              <div>{t('pages.jobs.revenueVariance')}: <strong className={varianceClass(job.revenueVarianceCents)}>{formatCurrencyOrNotSet(job.revenueVarianceCents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.costVariance')}: <strong className={varianceClass(job.costVarianceCents)}>{formatCurrencyOrNotSet(job.costVarianceCents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.marginVariance')}: <strong className={varianceClass(job.marginVarianceCents)}>{formatCurrencyOrNotSet(job.marginVarianceCents, t('common.notSet'))}</strong></div>
            </div>
            <div className="card">
              <h3>{t('pages.jobs.progressSection')}</h3>
              <div>{t('pages.jobs.revenueCompletionPct')}: <strong>{formatPctOrNotSet(job.revenueCompletionPct, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.costConsumptionPct')}: <strong>{formatPctOrNotSet(job.costConsumptionPct, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.marginVsTargetPct')}: <strong>{formatPctOrNotSet(job.marginVsTargetPct, t('common.notSet'))}</strong></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2>{t('pages.jobs.reportSummarySection')}</h2>
            <div className="grid-two" style={{ gap: '0.75rem' }}>
              <div>{t('pages.jobs.expectedRevenue')}: <strong>{formatCurrencyOrNotSet(summary.expected?.revenue_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.expectedCost')}: <strong>{formatCurrencyOrNotSet(summary.expected?.cost_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.expectedMargin')}: <strong>{formatCurrencyOrNotSet(summary.expected?.margin_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.totalIncome')}: <strong>{formatCurrencyOrNotSet(summary.totals.income_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.totalExpense')}: <strong>{formatCurrencyOrNotSet(summary.totals.expense_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.actualMargin')}: <strong>{formatCurrencyOrNotSet(summary.totals.margin_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.revenueVariance')}: <strong className={varianceClass(summary.variances?.revenue_cents)}>{formatCurrencyOrNotSet(summary.variances?.revenue_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.costVariance')}: <strong className={varianceClass(summary.variances?.cost_cents)}>{formatCurrencyOrNotSet(summary.variances?.cost_cents, t('common.notSet'))}</strong></div>
              <div>{t('pages.jobs.marginVariance')}: <strong className={varianceClass(summary.variances?.margin_cents)}>{formatCurrencyOrNotSet(summary.variances?.margin_cents, t('common.notSet'))}</strong></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2>{t('pages.jobs.breakdownByCategory')}</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left">{t('pages.movements.category')}</th>
                  <th align="left">{t('forms.direction')}</th>
                  <th align="right">{t('pages.movements.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.by_category.map((row) => (
                  <tr key={`${row.direction}-${row.category_id || 'none'}-${row.category_name}`}>
                    <td>{row.category_name}</td>
                    <td>{row.direction === 'income' ? t('pages.movements.income') : t('pages.movements.expense')}</td>
                    <td align="right">{formatCurrencyOrNotSet(row.amount_cents, t('common.notSet'))}</td>
                  </tr>
                ))}
                {summary.by_category.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">{t('common.none')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default JobDetailPage;
