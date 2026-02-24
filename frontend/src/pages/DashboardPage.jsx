import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { api } from '../services/api.js';

ChartJS.register(LineElement, BarElement, ArcElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const rangeFromPreset = (preset) => {
  const now = new Date();
  if (preset === 'last30days') {
    const from = new Date();
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

const centsToEuro = (cents) => `€ ${(Number(cents || 0) / 100).toFixed(2)}`;
const absCents = (value) => Math.abs(Number(value || 0));

const computeDelta = (current, previous) => {
  const prev = Number(previous || 0);
  const curr = Number(current || 0);
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const formatDelta = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`);
const deltaClass = (value) => {
  if (value == null || value === 0) return 'kpi-delta-badge neutral';
  return value > 0 ? 'kpi-delta-badge positive' : 'kpi-delta-badge negative';
};

const dimensionOptions = ['category', 'contact', 'account', 'job'];

const DashboardPage = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('last6months');
  const [summary, setSummary] = useState({
    income_sum_cents: 0,
    expense_sum_cents: 0,
    net_sum_cents: 0,
    by_bucket: [],
    previous: { income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0 },
  });
  const [incomeDimension, setIncomeDimension] = useState('category');
  const [expenseDimension, setExpenseDimension] = useState('category');
  const [pieCache, setPieCache] = useState({});

  const activeRange = useMemo(() => rangeFromPreset(period), [period]);

  useEffect(() => {
    const load = async () => {
      const summaryData = await api.getDashboardSummary({ ...activeRange, period });
      setSummary(summaryData);
    };
    load();
  }, [activeRange, period]);

  const loadPie = async (kind, dimension, topN = 12) => {
    const cacheKey = `${activeRange.from}:${activeRange.to}:${kind}:${dimension}:${topN}`;
    if (pieCache[cacheKey]) return pieCache[cacheKey];
    const response = await api.getDashboardPie({ ...activeRange, kind, dimension, topN });
    setPieCache((prev) => ({ ...prev, [cacheKey]: response }));
    return response;
  };

  const [incomePie, setIncomePie] = useState(null);
  const [expensePie, setExpensePie] = useState(null);
  const [topExpenses, setTopExpenses] = useState(null);

  useEffect(() => { loadPie('income', incomeDimension).then(setIncomePie); }, [incomeDimension, activeRange.from, activeRange.to]);
  useEffect(() => { loadPie('expense', expenseDimension).then(setExpensePie); }, [expenseDimension, activeRange.from, activeRange.to]);
  useEffect(() => { loadPie('expense', 'category', 10).then(setTopExpenses); }, [activeRange.from, activeRange.to]);

  const trendData = useMemo(() => {
    const labels = (summary.by_bucket || []).map((row) => row.label);
    return {
      labels,
      datasets: [
        {
          label: t('pages.dashboard.income'),
          data: (summary.by_bucket || []).map((row) => Number(row.income_sum_cents || 0) / 100),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.2)',
        },
        {
          label: t('pages.dashboard.expense'),
          data: (summary.by_bucket || []).map((row) => absCents(row.expense_sum_cents) / 100),
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220,38,38,0.2)',
        },
      ],
    };
  }, [summary.by_bucket, t]);

  const netTrendData = useMemo(() => ({
    labels: (summary.by_bucket || []).map((row) => row.label),
    datasets: [
      {
        label: t('pages.dashboard.netMonthlyTrend'),
        data: (summary.by_bucket || []).map((row) => Number(row.net_sum_cents || 0) / 100),
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29,78,216,0.2)',
      },
    ],
  }), [summary.by_bucket, t]);

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
      datasets: [{ data: values, backgroundColor: ['#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#65a30d', '#9333ea', '#0f766e', '#f59e0b', '#db2777', '#6b7280', '#111827'] }],
    };
  };

  const topExpensesBarData = useMemo(() => {
    if (!topExpenses) return { labels: [], datasets: [] };
    return {
      labels: topExpenses.slices.map((slice) => slice.label),
      datasets: [
        {
          label: t('pages.dashboard.topExpensesByCategory'),
          data: topExpenses.slices.map((slice) => Number(slice.value_cents || 0) / 100),
          backgroundColor: '#ef4444',
        },
      ],
    };
  }, [topExpenses, t]);

  const previous = summary.previous || {};
  const incomeDelta = computeDelta(summary.income_sum_cents, previous.income_sum_cents);
  const expenseDelta = computeDelta(absCents(summary.expense_sum_cents), absCents(previous.expense_sum_cents));
  const netDelta = computeDelta(summary.net_sum_cents, previous.net_sum_cents);

  const renderDimensionTabs = (selected, onChange) => (
    <div className="row-actions" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
      {dimensionOptions.map((dimension) => (
        <button key={dimension} type="button" className={selected === dimension ? '' : 'ghost'} onClick={() => onChange(dimension)}>
          {t(`pages.dashboard.dim.${dimension}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.dashboard.title')}</h1>
        <div>
          <label htmlFor="period" className="muted">{t('pages.dashboard.period')}</label>
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
          <small className={deltaClass(incomeDelta)}>{formatDelta(incomeDelta)}</small>
          <strong className="positive">{centsToEuro(summary.income_sum_cents)}</strong>
        </div>
        <div className="card kpi">
          <span>{t('pages.dashboard.expense')}</span>
          <small className={deltaClass(expenseDelta)}>{formatDelta(expenseDelta)}</small>
          <strong className="negative">{centsToEuro(absCents(summary.expense_sum_cents))}</strong>
        </div>
        <div className="card kpi">
          <span>{t('pages.dashboard.net')}</span>
          <small className={deltaClass(netDelta)}>{formatDelta(netDelta)}</small>
          <strong>{centsToEuro(summary.net_sum_cents)}</strong>
        </div>
      </div>

      <div className="grid-two">
        <div className="card">
          <h2>{t('pages.dashboard.trendIncomeExpense')}</h2>
          <Line data={trendData} />
        </div>
        <div className="card">
          <h2>{t('pages.dashboard.netMonthlyTrend')}</h2>
          <Line data={netTrendData} />
        </div>
      </div>

      <div className="grid-two" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2>{t('pages.dashboard.pieIncomeBy')}</h2>
          {renderDimensionTabs(incomeDimension, setIncomeDimension)}
          {pieToChartData(incomePie) ? <Pie data={pieToChartData(incomePie)} /> : <p className="muted">{t('common.none')}</p>}
        </div>
        <div className="card">
          <h2>{t('pages.dashboard.pieExpenseBy')}</h2>
          {renderDimensionTabs(expenseDimension, setExpenseDimension)}
          {pieToChartData(expensePie) ? <Pie data={pieToChartData(expensePie)} /> : <p className="muted">{t('common.none')}</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>{t('pages.dashboard.topExpensesByCategory')}</h2>
        <Bar data={topExpensesBarData} />
      </div>
    </div>
  );
};

export default DashboardPage;
