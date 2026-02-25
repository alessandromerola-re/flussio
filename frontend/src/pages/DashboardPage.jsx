import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
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

const dimensionOptions = ['category', 'contact', 'account', 'job'];

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

  return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1)), to: toIsoDate(now) };
};

const DashboardPage = () => {
  const { t } = useTranslation();

  const [period, setPeriod] = useState('last6months');
  const [incomeDimension, setIncomeDimension] = useState('category');
  const [expenseDimension, setExpenseDimension] = useState('category');

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

  const [pieCache, setPieCache] = useState({});
  const [incomePie, setIncomePie] = useState(null);
  const [expensePie, setExpensePie] = useState(null);
  const [topExpenses, setTopExpenses] = useState(null);

  const activeRange = useMemo(() => buildRangeFromPreset(period), [period]);

  useEffect(() => {
    const loadSummary = async () => {
      const response = await api.getDashboardSummary({ ...activeRange, period });
      setSummary((prev) => ({ ...prev, ...response }));
    };

    loadSummary();
  }, [activeRange, period]);

  const loadPie = async (kind, dimension, topN = 12) => {
    const cacheKey = `${activeRange.from}:${activeRange.to}:${kind}:${dimension}:${topN}`;
    if (pieCache[cacheKey]) return pieCache[cacheKey];

    const response = await api.getDashboardPie({ ...activeRange, kind, dimension, topN });
    setPieCache((prev) => ({ ...prev, [cacheKey]: response }));
    return response;
  };

  useEffect(() => {
    loadPie('income', incomeDimension).then(setIncomePie);
  }, [incomeDimension, activeRange.from, activeRange.to]);

  useEffect(() => {
    loadPie('expense', expenseDimension).then(setExpensePie);
  }, [expenseDimension, activeRange.from, activeRange.to]);

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

  const bucketSeries = summary.by_bucket || [];

  const currencyTooltip = (context) => {
    const value = Number(context?.parsed?.y ?? context?.parsed ?? 0);
    return centsToEuro(Math.round(value * 100));
  };

  const commonLineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${currencyTooltip(context)}`,
          },
        },
      },
    }),
    []
  );

  const trendData = useMemo(
    () => ({
      labels: bucketSeries.map((row) => row.label),
      datasets: [
        {
          label: t('pages.dashboard.income'),
          data: bucketSeries.map((row) => Number(row.income_sum_cents || 0) / 100),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.2)',
          fill: true,
          tension: 0.35,
        },
        {
          label: t('pages.dashboard.expense'),
          data: bucketSeries.map((row) => absCents(row.expense_sum_cents) / 100),
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220,38,38,0.2)',
          fill: true,
          tension: 0.35,
        },
      ],
    }),
    [bucketSeries, t]
  );

  const netTrendData = useMemo(
    () => ({
      labels: bucketSeries.map((row) => row.label),
      datasets: [
        {
          label: t('pages.dashboard.netMonthlyTrend'),
          data: bucketSeries.map((row) => Number(row.net_sum_cents || 0) / 100),
          borderColor: '#1d4ed8',
          backgroundColor: 'rgba(29,78,216,0.2)',
          tension: 0.35,
        },
      ],
    }),
    [bucketSeries, t]
  );

  const pieToChartData = (pieData) => {
    if (!pieData) return null;

    const labels = pieData.slices.map((slice) => slice.label);
    const values = pieData.slices.map((slice) => Number(slice.value_cents || 0) / 100);

    if (pieData.others_cents > 0) {
      labels.push(t('pages.dashboard.other'));
      values.push(Number(pieData.others_cents || 0) / 100);
    }

    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            '#2563eb',
            '#16a34a',
            '#dc2626',
            '#7c3aed',
            '#ea580c',
            '#0891b2',
            '#65a30d',
            '#9333ea',
            '#0f766e',
            '#f59e0b',
            '#db2777',
            '#6b7280',
            '#111827',
          ],
        },
      ],
    };
  };

  const topExpensesBarData = useMemo(() => {
    if (!topExpenses) return { labels: [], datasets: [] };

    const sortedSlices = [...topExpenses.slices].sort((a, b) => Number(b.value_cents || 0) - Number(a.value_cents || 0));

    return {
      labels: sortedSlices.map((slice) => slice.label),
      datasets: [
        {
          label: t('pages.dashboard.topExpensesByCategory'),
          data: sortedSlices.map((slice) => Number(slice.value_cents || 0) / 100),
          backgroundColor: '#ef4444',
        },
      ],
    };
  }, [topExpenses, t]);

  const kpiDeltas = useMemo(() => {
    const previous = summary.previous || {};

    return {
      income: computeDelta(summary.income_sum_cents, previous.income_sum_cents),
      expense: computeDelta(absCents(summary.expense_sum_cents), absCents(previous.expense_sum_cents)),
      net: computeDelta(summary.net_sum_cents, previous.net_sum_cents),
    };
  }, [summary.income_sum_cents, summary.expense_sum_cents, summary.net_sum_cents, summary.previous]);

  const renderDimensionTabs = (selected, onChange) => (
    <div className="row-actions dashboard-tabs" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
      {dimensionOptions.map((dimension) => (
        <button key={dimension} type="button" className={selected === dimension ? '' : 'ghost'} onClick={() => onChange(dimension)}>
          {t(`pages.dashboard.dim.${dimension}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header dashboard-page-header">
        <h1>{t('pages.dashboard.title')}</h1>
        <div className="dashboard-period">
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

      <div className="grid-two">
        <div className="card dashboard-chart-card">
          <h2>Cashflow trend</h2>
          <div className="dashboard-chart-wrap">
            <Line data={trendData} options={commonLineOptions} />
          </div>
        </div>

        <div className="card dashboard-chart-card">
          <h2>Netto nel tempo</h2>
          <div className="dashboard-chart-wrap">
            <Line data={netTrendData} options={commonLineOptions} />
          </div>
        </div>

      <div className="grid-two" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>Entrate per</h2>
          {renderDimensionTabs(incomeDimension, setIncomeDimension)}
          {pieToChartData(incomePie) ? <Pie data={pieToChartData(incomePie)} /> : <p className="muted">{t('common.none')}</p>}
        </div>

        <div className="card">
          <h2>Uscite per</h2>
          {renderDimensionTabs(expenseDimension, setExpenseDimension)}
          {pieToChartData(expensePie) ? <Pie data={pieToChartData(expensePie)} /> : <p className="muted">{t('common.none')}</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>{t('pages.dashboard.topExpensesByCategory')}</h2>
        <Bar
          data={topExpensesBarData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: (context) => `${context.label}: ${currencyTooltip(context)}`,
                },
              },
            },
            scales: {
              y: { beginAtZero: true },
            },
          }}
        />
      </div>
    </div>
  );
};

export default DashboardPage;
