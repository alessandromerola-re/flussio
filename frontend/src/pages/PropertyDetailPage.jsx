import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { canPermission } from '../utils/permissions.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDateIT } from '../utils/date.js';
import { getErrorMessage } from '../utils/errorMessages.js';

const pageSize = 20;
const emptyPeriod = { date_from: '', date_to: '' };

export default function PropertyDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(emptyPeriod);
  const [period, setPeriod] = useState(emptyPeriod);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const invalidPeriod = Boolean(draft.date_from && draft.date_to && draft.date_from > draft.date_to);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    async function load() {
      try {
        // Check property visibility before loading its movements.
        const property = await api.getProperty(id, period);
        if (!current) return;
        const response = await api.getTransactions({ property_id: id, ...period, limit: pageSize, offset, sort_by: 'date', sort_dir: 'desc' });
        if (!current) return;
        setResult({ property, rows: response.data ?? response, hasMore: response.headers?.get('X-Has-More') === 'true' });
      } catch (failure) {
        if (current) setError(failure);
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [id, period, offset, retry]);

  const movementsUrl = `/movements?${new URLSearchParams({ property_id: id, ...period })}`;
  const property = result?.property;
  return (
    <div className="page property-detail">
      <Link to="/registry?tab=properties">← {t('pages.registry.properties')}</Link>
      <div className="page-header">
        <h1>{property?.name || t('pages.property.title')}</h1>
        {canPermission('write') && property && (
          <Link className="property-action" to={`/movements?property_id=${id}&new=1`}>{t('pages.movements.new')}</Link>
        )}
      </div>
      <form className="card property-period" onSubmit={(event) => { event.preventDefault(); if (!invalidPeriod) { setOffset(0); setPeriod({ ...draft }); } }}>
        <label>{t('pages.property.from')}<input type="date" value={draft.date_from} onChange={(event) => setDraft({ ...draft, date_from: event.target.value })} /></label>
        <label>{t('pages.property.to')}<input type="date" value={draft.date_to} min={draft.date_from || undefined} onChange={(event) => setDraft({ ...draft, date_to: event.target.value })} /></label>
        <button type="submit" disabled={invalidPeriod}>{t('pages.property.apply')}</button>
        <button type="button" className="secondary" onClick={() => { setDraft(emptyPeriod); setPeriod(emptyPeriod); setOffset(0); }}>{t('pages.property.allTime')}</button>
        {invalidPeriod && <p className="error" role="alert">{t('pages.property.invalidPeriod')}</p>}
      </form>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <div className="card" role="alert"><p>{getErrorMessage(t, error)}</p><button onClick={() => setRetry((value) => value + 1)}>{t('buttons.retry')}</button></div>}
      {!loading && property && <>
        <section className="card property-info" aria-label={t('pages.property.data')}>
          <dl>
            <div><dt>{t('forms.propertyCode')}</dt><dd>{property.external_id}</dd></div>
            <div><dt>{t('pages.registry.status')}</dt><dd>{t(property.is_active ? 'labels.active' : 'labels.inactive')}</dd></div>
            <div><dt>{t('forms.address')}</dt><dd>{property.address || t('common.none')}</dd></div>
            <div><dt>{t('forms.referenceContact')}</dt><dd>{property.contact_name || t('common.none')}
              {property.contact_email && <span className="property-contact-line">{property.contact_email}</span>}
              {property.contact_phone && <span className="property-contact-line">{property.contact_phone}</span>}
            </dd></div>
          </dl>
          {property.notes && <div className="property-notes"><strong>{t('forms.notes')}</strong><p>{property.notes}</p></div>}
        </section>
        <section aria-label={t('pages.property.cashflow')}>
          <h2>{t('pages.property.cashflow')}</h2>
          <p className="muted">{t('pages.property.cashflowHint')}</p>
          <div className="property-summary">
            {[['income', 'positive'], ['expense', 'negative'], ['net', '']].map(([key, color]) => (
              <div className="card" key={key}><span>{t(`pages.dashboard.${key}`)}</span><strong className={color}>{formatCurrency(property[key])}</strong></div>
            ))}
          </div>
        </section>
        <section className="card" aria-label={t('pages.property.movements')}>
          <div className="property-movements-heading"><h2>{t('pages.property.movements')} ({property.movement_count})</h2><Link to={movementsUrl}>{t('pages.property.openMovements')}</Link></div>
          {!result.rows.length ? <p>{t('pages.property.empty')}</p> : <ul className="property-movements">
            {result.rows.map((row) => <li key={row.id}>
              <div><strong>{row.description || t(`pages.movements.${row.type}`)}</strong><div className="muted">{formatDateIT(row.date)} · {t(`pages.movements.${row.type}`)}</div>
                {row.category_name && <div className="muted">{row.category_name}</div>}
              </div>
              <strong className={row.type === 'income' ? 'positive' : row.type === 'expense' ? 'negative' : ''}>{formatCurrency(row.amount_total)}</strong>
            </li>)}
          </ul>}
          <nav className="property-pagination" aria-label={t('pages.property.pagination')}>
            <button type="button" className="secondary" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - pageSize))}>{t('pages.property.previous')}</button>
            <span>{t('pages.property.page')} {offset / pageSize + 1}</span>
            <button type="button" className="secondary" disabled={!result.hasMore} onClick={() => setOffset((value) => value + pageSize)}>{t('pages.property.next')}</button>
          </nav>
        </section>
      </>}
    </div>
  );
}
