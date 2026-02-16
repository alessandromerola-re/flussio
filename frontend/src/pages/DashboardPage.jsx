import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { api } from '../services/api.js';
import { formatDayMonthIT, formatMonthYearIT } from '../utils/date.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

const DashboardPage = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('currentmonth');
  const [summary, setSummary] = useState({ income_total: 0, expense_total: 0, net: 0 });
  const [cashflow, setCashflow] = useState([]);
  const [topCategories, setTopCategories] = useState([]);

  useEffect(() => {
    const loadDashboard = async () => {
      const [summaryData, cashflowData, topCategoriesData] = await Promise.all([
        api.getSummary(period),
        api.getCashflow(period),
        api.getTopCategories(period, 'expense'),
      ]);
      setSummary(summaryData);
      setCashflow(cashflowData);
      setTopCategories(topCategoriesData);
    };
    loadDashboard();
  }, [period]);

  const chartData = useMemo(() => {
    const formatLabel = (value) => {
      if (!value) return '';
      if (period === 'last7days' || period === 'last30days' || period === 'currentmonth') {
        return formatDayMonthIT(value);
      }
      return formatMonthYearIT(value);
    };
    const labels = cashflow.map((item) => formatLabel(item.bucket));
    return {
      labels,
      datasets: [
        {
          label: t('pages.dashboard.income'),
          data: cashflow.map((item) => Number(item.income)),
          borderColor: '#2ecc71',
          backgroundColor: 'rgba(46, 204, 113, 0.2)',
        },
        {
          label: t('pages.dashboard.expense'),
          data: cashflow.map((item) => Number(item.expense)),
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.2)',
        },
      ],
    };
  }, [cashflow, period, t]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.dashboard.title')}</h1>
        <div>
          <label htmlFor="period" className="muted">
            {t('pages.dashboard.period')}
          </label>
          <select id="period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="last7days">{t('pages.dashboard.last7days')}</option>
            <option value="last30days">{t('pages.dashboard.last30days')}</option>
            <option value="currentmonth">{t('pages.dashboard.currentMonth')}</option>
            <option value="last6months">{t('pages.dashboard.last6months')}</option>
            <option value="currentyear">{t('pages.dashboard.currentYear')}</option>
            <option value="previousyear">{t('pages.dashboard.previousYear')}</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card kpi">
          <span>{t('pages.dashboard.income')}</span>
          <strong className="positive">€ {summary.income_total.toFixed(2)}</strong>
        </div>
        <div className="card kpi">
          <span>{t('pages.dashboard.expense')}</span>
          <strong className="negative">€ {summary.expense_total.toFixed(2)}</strong>
        </div>
        <div className="card kpi">
          <span>{t('pages.dashboard.net')}</span>
          <strong>€ {summary.net.toFixed(2)}</strong>
        </div>
      </div>

      <div className="grid-two">
        <div className="card">
          <h2>{t('pages.dashboard.chartTitle')}</h2>
          <Line data={chartData} />
        </div>
        <div className="card">
          <h2>{t('pages.dashboard.topCategories')}</h2>
          <ul className="list">
            {topCategories.length === 0 && <li className="muted">{t('common.none')}</li>}
            {topCategories.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <strong>€ {Number(item.total).toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
