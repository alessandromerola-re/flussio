import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { api } from '../services/api.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

const toIsoDate = (date) => date.toISOString().slice(0, 10);
const centsToEuro = (cents) => `€ ${(Number(cents || 0) / 100).toFixed(2)}`;
const absCents = (value) => Math.abs(Number(value || 0));

const computeDelta = (current, previousValue) => {
  const currentNumber = Number(current || 0);
  const previousNumber = Number(previousValue || 0);
  if (previousNumber === 0) return null;
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
};

const formatDelta = (delta) => (delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`);
const deltaClassName = (delta) => {
  if (delta == null || delta === 0) return 'kpi-delta-badge neutral';
  return delta > 0 ? 'kpi-delta-badge positive' : 'kpi-delta-badge negative';
};

const buildRangeFromPreset = (preset) => {
  const now = new Date();

  if (preset === 'last30days') {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: toIsoDate(from), to: toIsoDate(now) };
  }

  if (preset === 'currentmonth') {
    return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) };
  }

  if (preset === 'currentyear') {
    return { from: toIsoDate(new Date(now.getFullYear(), 0, 1)), to: toIsoDate(now) };
  }

  // default: last6months
  return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: toIsoDate(now) };
};

const DashboardPage = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('last6months');

  const [summary, setSummary] = useState({
    income_sum_cents: 0,
    expense_sum_cents: 0,
    net_sum_cents: 0,
    by_bucket: [],
    previous: {
      income_sum_cents: 0,
      expense_sum_cents: 0,
      net_sum_cents: 0,
    },
  });

  const activeRange = useMemo(() => buildRangeFromPreset(period), [period]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const response = await api.getDashboardSummary({ ...activeRange, period });
      if (!cancelled) setSummary((prev) => ({ ...prev, ...response }));
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeRange, period]);

  // ⚠️ IMPORTANTISSIMO: queste 3 righe devono esistere UNA SOLA VOLTA nel file (guard build)
  const bucketSeries = summary.by_bucket || [];
  const previous = summary.previous || {};
  const kpiDeltas = useMemo(() => {
    return {
      income: computeDelta(summary.income_sum_cents, previous.income_sum_cents),
      expense: computeDelta(absCents(summary.expense_sum_cents), absCents(previous.expense_sum_cents)),
      net: computeDelta(summary.net_sum_cents, previous.net_sum_cents),
    };
  }, [summary.income_sum_cents, summary.expense_sum_cents, summary.net_sum_cents, summary.previous]);

  const trendData = useMemo(() => {
    const labels = bucketSeries.map((row) => row.label);
    const income = bucketSeries.map((row) => Number(row.income_sum_cents || 0) / 100);
    const expense = bucketSeries.map((row) => absCents(row.expense_sum_cents) / 100); // uscite verso l’alto

    return {
      labels,
      datasets: [
        {
          label: t('pages.dashboard.income'),
          data: income,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.15)',
          tension: 0.25,
        },
        {
          label: t('pages.dashboard.expense'),
          data: expense,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220,38,38,0.15)',
          tension: 0.25,
        },
      ],
    };
  }, [bucketSeries, t]);

  const trendOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    }),
    []
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.dashboard.title')}</h1>
        <div>
          <label htmlFor="period" className="muted">
            {t('pages.dashboard.period')}
          </label>
          <select id="period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="last30days">{t('pages.dashboard.last30days')}</option>
            <option value="currentmonth">{t('pages.dashboard.currentMonth')}</option>
            <option value="last6months">{t('pages.dashboard.last6months')}</option>
            <option value="currentyear">{t('pages.dashboard.currentYear')}</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card kpi">
          <span>{t('pages.dashboard.income')}</span>
          <small className={deltaClassName(kpiDeltas.income)}>{formatDelta(kpiDeltas.income)}</small>
          <strong className="positive">{centsToEuro(summary.income_sum_cents)}</strong>
        </div>

        <div className="card kpi">
          <span>{t('pages.dashboard.expense')}</span>
          <small className={deltaClassName(kpiDeltas.expense)}>{formatDelta(kpiDeltas.expense)}</small>
          <strong className="negative">{centsToEuro(absCents(summary.expense_sum_cents))}</strong>
        </div>

        <div className="card kpi">
          <span>{t('pages.dashboard.net')}</span>
          <small className={deltaClassName(kpiDeltas.net)}>{formatDelta(kpiDeltas.net)}</small>
          <strong>{centsToEuro(summary.net_sum_cents)}</strong>
        </div>
      </div>

      <div className="card" style={{ height: 360 }}>
        <h2>{t('pages.dashboard.trendIncomeExpense')}</h2>
        <div style={{ height: 300 }}>
          <Line data={trendData} options={trendOptions} />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
