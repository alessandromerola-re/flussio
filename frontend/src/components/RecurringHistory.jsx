import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';
import { getErrorMessage } from '../utils/errorMessages.js';
import { formatTimestampDateIT } from '../utils/date.js';
import Modal from './Modal.jsx';

export default function RecurringHistory({ template, onClose }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let current = true;
    setData(null); setError(null);
    api.getRecurringRuns(template.id, offset).then((result) => { if (current) setData(result); })
      .catch((failure) => { if (current) setError(failure); });
    return () => { current = false; };
  }, [template.id, offset, retry]);
  return <Modal isOpen onClose={onClose} title={`${t('pages.recurring.history')}: ${template.title}`}>
    {error ? <div role="alert"><p>{getErrorMessage(t, error)}</p><button onClick={() => setRetry((value) => value + 1)}>{t('buttons.retry')}</button></div> : !data ? <p role="status">{t('common.loading')}</p> : <>
      {!data.rows.length ? <p>{t('pages.recurring.noRuns')}</p> : <ul className="list">{data.rows.map((run) => <li className="list-item-row" key={run.id}>
        <div><strong>{formatTimestampDateIT(run.run_at)}</strong><div>{run.cycle_key} · {t(`pages.recurring.run.${run.run_type}`)}</div></div>
        {run.generated_movement_id ? <Link to={`/movements?transaction_id=${run.generated_movement_id}`}>{t('pages.movements.open')} #{run.generated_movement_id}</Link> : <span>{t('pages.recurring.movementUnavailable')}</span>}
      </li>)}</ul>}
      <nav className="property-pagination" aria-label={t('pages.recurring.history')}><button disabled={!offset} onClick={() => setOffset((value) => value - 20)}>{t('pages.property.previous')}</button><span>{offset / 20 + 1}</span><button disabled={!data.has_more} onClick={() => setOffset((value) => value + 20)}>{t('pages.property.next')}</button></nav>
    </>}
  </Modal>;
}
