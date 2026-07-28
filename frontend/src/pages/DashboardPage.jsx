import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, Line, Pie } from 'react-chartjs-2';
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
import { formatDateInTimeZone } from '../utils/date.js';
import { loadDashboardData } from '../utils/dashboardLoader.js';

ChartJS.register(LineElement, BarElement, ArcElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

const toIsoDate = formatDateInTimeZone;
const centsToEuro = (cents) => `€ ${(Number(cents || 0) / 100).toFixed(2)}`;
const absCents = (value) => Math.abs(Number(value || 0));
const emptySeriesMessage = 'Nessun dato nel periodo selezionato';
const emptySummary = { income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0, by_bucket: [], previous: { income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0 } };

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

  const [summary, setSummary] = useState(emptySummary);

  const [incomePie, setIncomePie] = useState(null);
  const [expensePie, setExpensePie] = useState(null);
  const [topExpenses, setTopExpenses] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [showAllTopExpenses, setShowAllTopExpenses] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const requestIdRef = useRef(0);

  const activeRange = useMemo(() => buildRangeFromPreset(period), [period]);


  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setDashboardError('');
    setSummary(emptySummary);
    setIncomePie(null);
    setExpensePie(null);
    setTopExpenses(null);
    setShowAllTopExpenses(false);
    loadDashboardData({ client: api, range: activeRange, period, incomeDimension, expenseDimension }).then(({ summary: nextSummary, incomePie: nextIncome, expensePie: nextExpense, topExpenses: nextTop }) => {
      if (requestId !== requestIdRef.current) return;
      setSummary({ ...emptySummary, ...nextSummary });
      setIncomePie(nextIncome); setExpensePie(nextExpense); setTopExpenses(nextTop);
      setLoading(false);
    }).catch(() => {
      if (requestId !== requestIdRef.current) return;
      setDashboardError('Impossibile caricare i dati della Dashboard.');
      setLoading(false);
    });
  }, [activeRange.from, activeRange.to, period, incomeDimension, expenseDimension, retryKey]);

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


  const pieOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${currencyTooltip(context)}`,
          },
        },
      },
    }),
    []
  );

  const hasBucketData = useMemo(() => {
    if (!bucketSeries.length) return false;
    return bucketSeries.some((row) => absCents(row.income_sum_cents) > 0 || absCents(row.expense_sum_cents) > 0 || absCents(row.net_sum_cents) > 0);
  }, [bucketSeries]);

  const shouldFallbackPieToList = (pieData) => {
    if (!pieData || !Array.isArray(pieData.slices) || pieData.slices.length <= 1) {
      return true;
    }

    const total = pieData.slices.reduce((sum, slice) => sum + absCents(slice.value_cents), 0) + absCents(pieData.others_cents);
    if (total <= 0) {
      return true;
    }

    const firstValue = absCents(pieData.slices[0]?.value_cents);
    return (firstValue / total) > 0.8;
  };

  const buildPieTopList = (pieData, maxItems = 5) => {
    if (!pieData || !Array.isArray(pieData.slices)) return [];
    const sorted = [...pieData.slices].sort((a, b) => absCents(b.value_cents) - absCents(a.value_cents));
    const total = sorted.reduce((sum, slice) => sum + absCents(slice.value_cents), 0) + absCents(pieData.others_cents);
    if (total <= 0) return [];

    return sorted.slice(0, maxItems).map((slice) => {
      const cents = absCents(slice.value_cents);
      return {
        label: slice.label,
        value: centsToEuro(cents),
        percent: `${((cents / total) * 100).toFixed(1)}%`,
      };
    });
  };

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
    const visibleSlices = isMobile && !showAllTopExpenses ? sortedSlices.slice(0, 5) : sortedSlices;

    return {
      labels: visibleSlices.map((slice) => slice.label),
      datasets: [
        {
          label: t('pages.dashboard.topExpensesByCategory'),
          data: visibleSlices.map((slice) => Number(slice.value_cents || 0) / 100),
          backgroundColor: '#ef4444',
        },
      ],
    };
  }, [isMobile, showAllTopExpenses, topExpenses, t]);

  const previous = summary.previous || {};

  const kpiDeltas = useMemo(() => {
    return {
      income: computeDelta(summary.income_sum_cents, previous.income_sum_cents),
      expense: computeDelta(absCents(summary.expense_sum_cents), absCents(previous.expense_sum_cents)),
      net: computeDelta(summary.net_sum_cents, previous.net_sum_cents),
    };
  }, [
    summary.income_sum_cents,
    summary.expense_sum_cents,
    summary.net_sum_cents,
    previous.income_sum_cents,
    previous.expense_sum_cents,
    previous.net_sum_cents,
  ]);

  const topExpensesOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${currencyTooltip(context)}`,
          },
        },
      },
      scales: {
        x: { beginAtZero: true },
        y: { ticks: { autoSkip: false } },
      },
    }),
    []
  );

  const renderDimensionTabs = (selected, onChange) => (
    <div className="row-actions dashboard-tabs" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
      {dimensionOptions.map((dimension) => (
        <button
          key={dimension}
          type="button"
          className={selected === dimension ? '' : 'ghost'}
          onClick={() => onChange(dimension)}
        >
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

      {loading && <div className="card" aria-live="polite">Caricamento Dashboard…</div>}
      {dashboardError && <div className="error" role="alert" aria-live="assertive">{dashboardError} <button type="button" className="ghost" onClick={() => setRetryKey((value) => value + 1)}>Riprova</button></div>}
      {!loading && !dashboardError && <>

      <div className="kpi-grid">
        <div className="card kpi">
          <span>{t('pages.dashboard.income')}</span>
          <small className={deltaClassName(kpiDeltas.income)}>{formatDelta(kpiDeltas.income)}</small>
          <strong className="positive">{centsToEuro(summary.income_sum_cents)}</strong>
        </div>

        <div className="card kpi">
          <span>{t('pages.dashboard.expense')}</span>
          <small className={deltaClassName(kpiDeltas.expense == null ? null : -kpiDeltas.expense)}>{formatDelta(kpiDeltas.expense)} · {kpiDeltas.expense > 0 ? 'peggioramento' : kpiDeltas.expense < 0 ? 'miglioramento' : 'invariato'}</small>
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
          <div className="dashboard-chart-wrap dashboard-chart-wrap--line">
            {hasBucketData ? <Line data={trendData} options={commonLineOptions} /> : <p className="muted">{emptySeriesMessage}</p>}
          </div>
        </div>

        <div className="card dashboard-chart-card">
          <h2>Netto nel tempo</h2>
          <div className="dashboard-chart-wrap dashboard-chart-wrap--line">
            {hasBucketData ? <Line data={netTrendData} options={commonLineOptions} /> : <p className="muted">{emptySeriesMessage}</p>}
          </div>
        </div>
      </div>

      <div className="grid-two" style={{ marginTop: '1rem' }}>
        <div className="card dashboard-chart-card">
          <h2>Entrate per</h2>
          {renderDimensionTabs(incomeDimension, setIncomeDimension)}
          <div className="dashboard-chart-wrap dashboard-chart-wrap--pie">
            {pieToChartData(incomePie) ? (
              shouldFallbackPieToList(incomePie) ? (
                <ul className="list dashboard-pie-fallback-list">
                  {buildPieTopList(incomePie).map((item) => (
                    <li key={item.label} className="list-item-row">
                      <span>{item.label}</span>
                      <strong>{item.value} <small className="muted">({item.percent})</small></strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <Pie data={pieToChartData(incomePie)} options={pieOptions} />
              )
            ) : <p className="muted">{t('common.none')}</p>}
          </div>
        </div>

        <div className="card dashboard-chart-card">
          <h2>Uscite per</h2>
          {renderDimensionTabs(expenseDimension, setExpenseDimension)}
          <div className="dashboard-chart-wrap dashboard-chart-wrap--pie">
            {pieToChartData(expensePie) ? (
              shouldFallbackPieToList(expensePie) ? (
                <ul className="list dashboard-pie-fallback-list">
                  {buildPieTopList(expensePie).map((item) => (
                    <li key={item.label} className="list-item-row">
                      <span>{item.label}</span>
                      <strong>{item.value} <small className="muted">({item.percent})</small></strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <Pie data={pieToChartData(expensePie)} options={pieOptions} />
              )
            ) : <p className="muted">{t('common.none')}</p>}
          </div>
        </div>
      </div>

      <div className="card dashboard-chart-card" style={{ marginTop: '1rem' }}>
        <h2>{t('pages.dashboard.topExpensesByCategory')}</h2>
        {isMobile && topExpenses?.slices?.length > 5 && (
          <div className="row-actions" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="ghost" onClick={() => setShowAllTopExpenses((prev) => !prev)}>
              {showAllTopExpenses ? 'Mostra meno' : 'Mostra tutte'}
            </button>
          </div>
        )}
        <div className={`dashboard-chart-wrap dashboard-chart-wrap--bar ${showAllTopExpenses ? 'dashboard-chart-wrap--scroll' : ''}`}>
          {topExpensesBarData.labels.length ? <Bar data={topExpensesBarData} options={topExpensesOptions} /> : <p className="muted">{emptySeriesMessage}</p>}
        </div>
      </div>
      </>}
    </div>
  );
};

export default DashboardPage;
