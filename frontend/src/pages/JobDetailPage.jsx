import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { getErrorMessage } from '../utils/errorMessages.js';

const defaultFilters = {
  date_from: '',
  date_to: '',
};

const formatCurrencyFromCents = (valueCents) => `€ ${(Number(valueCents || 0) / 100).toFixed(2)}`;

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
    } catch (loadError) {
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

          <div className="row-actions" style={{ marginBottom: '1rem' }}>
            <button type="button" onClick={() => navigate(`/movements?job_id=${job.id}`)}>
              {t('buttons.goToMovements')}
            </button>
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
              <h3>{t('pages.jobs.totalIncome')}</h3>
              <strong>{formatCurrencyFromCents(summary.totals.income_cents)}</strong>
            </div>
            <div className="card">
              <h3>{t('pages.jobs.totalExpense')}</h3>
              <strong>{formatCurrencyFromCents(summary.totals.expense_cents)}</strong>
            </div>
            <div className="card">
              <h3>{t('pages.jobs.totalMargin')}</h3>
              <strong>{formatCurrencyFromCents(summary.totals.margin_cents)}</strong>
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
                    <td align="right">{formatCurrencyFromCents(row.amount_cents)}</td>
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
