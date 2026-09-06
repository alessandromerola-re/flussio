import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { formatCurrency, formatCurrencyFromCents } from '../utils/currency.js';
import { formatDateIT } from '../utils/date.js';
import { getCostVariancePresentation } from '../utils/jobCostVariance.js';
import { getErrorMessage } from '../utils/errorMessages.js';

const emptyPeriod = { date_from: '', date_to: '' };
const pageSize = 20;
const varianceClass = (value) => value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';

function JobDetail({ id }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(emptyPeriod);
  const [period, setPeriod] = useState(emptyPeriod);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setResult(null);
    setError(null);
    async function load() {
      try {
        const job = await api.getJob(id);
        if (!current) return;
        const [summary, response] = await Promise.all([
          api.getJobReportSummary(id, period),
          api.getTransactions({ job_id: id, ...period, limit: pageSize, offset, sort_by: 'date', sort_dir: 'desc' }),
        ]);
        if (current) setResult({ job, summary, rows: response.data ?? response,
          hasMore: response.headers?.get('X-Has-More') === 'true',
          count: Number(response.headers?.get('X-Total-Count') ?? (response.data ?? response).length) });
      } catch (failure) {
        if (current) setError(failure);
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [id, period, offset, retry]);

  const exportCsv = async (scope) => {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setExportError(null);
    try {
      // The budget report is always lifetime; the period export contains movements only.
      const { blob } = scope === 'lifetime'
        ? await api.exportJobReportCsv(id, {})
        : await api.exportTransactions({ job_id: id, ...period });
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `flussio_commessa_${id}_${scope}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally { URL.revokeObjectURL(url); }
    } catch (failure) { if (mounted.current) setExportError(failure); }
    finally { exportLock.current = false; if (mounted.current) setExporting(false); }
  };

  const money = (value) => formatCurrencyFromCents(value) ?? t('common.notSet');
  const pct = (value) => value == null ? t('common.notSet') : `${Number(value).toFixed(1)}%`;
  const invalidPeriod = Boolean(draft.date_from && draft.date_to && draft.date_to < draft.date_from);
  const job = result?.job;
  const status = !job?.is_active ? 'labels.inactive' : job.is_closed ? 'labels.jobClosed' : 'labels.jobOpen';
  const movementsUrl = `/movements?${new URLSearchParams({ job_id: id, ...period })}`;
  const comparison = job ? [
    ['revenue', job.expectedRevenueCents, job.totalIncomeCents, job.revenueVarianceCents],
    ['cost', job.expectedCostCents, job.totalExpenseCents, job.costVarianceCents],
    ['margin', job.expectedMarginCents, job.actualMarginCents, job.marginVarianceCents],
  ] : [];

  return <div className="page property-detail job-detail">
    <Link to="/registry?tab=jobs">← {t('pages.registry.jobs')}</Link>
    <div className="page-header"><h1>{job?.title || t('pages.jobs.headerTitle')}</h1>
      {job && canPermission('write') && <Link className="property-action" to={`/movements?job_id=${id}&new=1`}>{t('pages.movements.new')}</Link>}
    </div>
    {loading && <p role="status">{t('common.loading')}</p>}
    {error && <div className="card" role="alert"><p>{getErrorMessage(t, error)}</p><button onClick={() => setRetry((value) => value + 1)}>{t('buttons.retry')}</button></div>}
    {exportError && <p role="alert" className="error">{getErrorMessage(t, exportError)}</p>}
    {!loading && job && <>
      <section className="card property-info" aria-label={t('pages.jobs.headerTitle')}>
        <dl>{[
          ['forms.jobCode', job.code], ['forms.jobStatus', t(status)], ['forms.referenceContact', job.contact_name],
          ['forms.jobStartDate', formatDateIT(job.start_date)], ['forms.jobEndDate', formatDateIT(job.end_date)],
        ].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value || t('common.notSet')}</dd></div>)}</dl>
        {job.notes && <div className="property-notes"><strong>{t('forms.notes')}</strong><p>{job.notes}</p></div>}
      </section>
      <section aria-label={t('pages.jobs.lifetime')}>
        <h2>{t('pages.jobs.lifetime')}</h2><p className="muted">{t('pages.jobs.lifetimeHint')}</p>
        <div className="job-comparison-grid">{comparison.map(([kind, expected, actual, variance]) => {
          const cost = kind === 'cost' ? getCostVariancePresentation(variance) : null;
          return <article className="card job-comparison" key={kind} aria-label={t(`pages.jobs.metric.${kind}`)}>
            <h3>{t(`pages.jobs.metric.${kind}`)}</h3>
            <dl><div><dt>{t('pages.jobs.budget')}</dt><dd>{money(expected)}</dd></div>
              <div><dt>{t('pages.jobs.recorded')}</dt><dd>{money(actual)}</dd></div>
              <div><dt>{t('pages.jobs.difference')}</dt><dd className={cost?.className ?? varianceClass(variance)} aria-label={cost?.label}>{money(variance)}</dd></div></dl>
          </article>;
        })}</div>
        <p className="muted">{t('pages.jobs.costHint')}</p>
        <details className="card job-progress"><summary>{t('pages.jobs.progressSection')}</summary><dl>
          {[
            ['pages.jobs.revenueCompletionPct', job.revenueCompletionPct],
            ['pages.jobs.costConsumptionPct', job.costConsumptionPct],
            ['pages.jobs.marginVsTargetPct', job.marginVsTargetPct],
          ].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{pct(value)}</dd></div>)}
        </dl></details>
        {canPermission('export') && <button type="button" className="secondary" disabled={exporting} onClick={() => exportCsv('lifetime')}>{t('pages.jobs.exportLifetime')}</button>}
      </section>
    </>}
    <section aria-label={t('pages.jobs.period')}>
      <h2>{t('pages.jobs.period')}</h2><p className="muted">{t('pages.jobs.periodHint')}</p>
      <form className="card property-period" onSubmit={(event) => { event.preventDefault(); if (!invalidPeriod) { setPeriod({ ...draft }); setOffset(0); } }}>
        <label>{t('pages.movements.dateFrom')}<input type="date" value={draft.date_from} onChange={(event) => setDraft({ ...draft, date_from: event.target.value })} /></label>
        <label>{t('pages.movements.dateTo')}<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(event) => setDraft({ ...draft, date_to: event.target.value })} /></label>
        <button type="submit" disabled={invalidPeriod}>{t('buttons.apply')}</button>
        <button type="button" className="secondary" onClick={() => { setDraft(emptyPeriod); setPeriod(emptyPeriod); setOffset(0); }}>{t('pages.property.allTime')}</button>
        {invalidPeriod && <p role="alert" className="error">{t('pages.property.invalidPeriod')}</p>}
      </form>
      {!loading && result && <>
        <p className="muted">{t('pages.jobs.appliedPeriod')}: {period.date_from || period.date_to
          ? `${formatDateIT(period.date_from) || '…'} – ${formatDateIT(period.date_to) || '…'}` : t('pages.property.allTime')}</p>
        <div className="property-summary">{[['income_cents', 'income', 'positive'], ['expense_cents', 'expense', 'negative'], ['margin_cents', 'net', '']].map(([key, label, color]) => <div className="card" key={key}><span>{t(`pages.dashboard.${label}`)}</span><strong className={color}>{money(result.summary.totals[key])}</strong></div>)}</div>
        <details className="card job-progress"><summary>{t('pages.jobs.breakdownByCategory')}</summary>
          {!result.summary.by_category.length ? <p>{t('common.none')}</p> : <ul className="property-movements">{result.summary.by_category.map((row, index) => <li key={`${row.category_id}-${row.direction}-${index}`}><div>{row.category_name}<div className="muted">{t(`pages.movements.${row.direction}`)}</div></div><strong>{money(row.amount_cents)}</strong></li>)}</ul>}
        </details>
        <section className="card" aria-label={t('pages.jobs.linkedMovements')}>
          <div className="property-movements-heading"><h3>{t('pages.jobs.linkedMovements')} ({result.count})</h3><Link to={movementsUrl}>{t('buttons.goToMovements')}</Link></div>
          {canPermission('export') && <button type="button" className="secondary" disabled={exporting} onClick={() => exportCsv('period')}>{t('pages.jobs.exportPeriod')}</button>}
          {!result.rows.length ? <p>{t('pages.jobs.emptyPeriod')}</p> : <ul className="property-movements">{result.rows.map((row) => <li key={row.id}><div><strong>{row.description || t(`pages.movements.${row.type}`)}</strong><div className="muted">{formatDateIT(row.date)} · {t(`pages.movements.${row.type}`)}</div>{row.category_name && <div className="muted">{row.category_name}</div>}</div><strong className={row.type === 'income' ? 'positive' : row.type === 'expense' ? 'negative' : ''}>{formatCurrency(row.amount_total)}</strong></li>)}</ul>}
          <nav className="property-pagination" aria-label={t('pages.jobs.pagination')}><button className="secondary" disabled={!offset} onClick={() => setOffset((value) => Math.max(0, value - pageSize))}>{t('pages.property.previous')}</button><span>{t('pages.property.page')} {offset / pageSize + 1}</span><button className="secondary" disabled={!result.hasMore} onClick={() => setOffset((value) => value + pageSize)}>{t('pages.property.next')}</button></nav>
        </section>
      </>}
    </section>
  </div>;
}

export default function JobDetailPage() {
  const { id } = useParams();
  return <JobDetail key={id} id={id} />;
}
