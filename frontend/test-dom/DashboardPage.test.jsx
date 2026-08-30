import React, { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '../src/pages/DashboardPage.jsx';
import { api } from '../src/services/api.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => ({
    'pages.dashboard.title': 'Dashboard',
    'pages.dashboard.period': 'Periodo',
    'pages.dashboard.income': 'Entrate',
    'pages.dashboard.expense': 'Uscite',
    'pages.dashboard.net': 'Netto',
    'pages.dashboard.topExpensesByCategory': 'Top uscite',
    'pages.dashboard.loading': 'Caricamento dashboard…',
    'common.none': 'Nessun dato',
  }[key] || key) }),
}));

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }) => <div data-testid="line-chart">{data.labels.join(',')}</div>,
  Pie: ({ data }) => <div data-testid="pie-chart">{data.labels.join(',')}</div>,
  Bar: ({ data }) => <div data-testid="bar-chart">{data.labels.join(',')}</div>,
}));

vi.mock('../src/services/api.js', () => ({
  api: { getDashboardSummary: vi.fn(), getDashboardPie: vi.fn() },
}));

const summary = (overrides = {}) => ({
  income_sum_cents: 12000,
  expense_sum_cents: -4000,
  net_sum_cents: 8000,
  by_bucket: [{ label: 'Gen', income_sum_cents: 12000, expense_sum_cents: -4000, net_sum_cents: 8000 }],
  previous: { income_sum_cents: 10000, expense_sum_cents: -5000, net_sum_cents: 5000 },
  ...overrides,
});
const pie = (label = 'Categoria') => ({ slices: [{ label, value_cents: 1000 }], others_cents: 0 });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const renderDashboard = (element = <DashboardPage />) => render(element);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  api.getDashboardSummary.mockResolvedValue(summary());
  api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) =>
    Promise.resolve(pie(`${kind}-${dimension}-${topN}`)));
});

describe('DashboardPage DOM behaviour', () => {
  it('loads the dashboard initially', async () => {
    renderDashboard();
    expect(screen.getByText('Caricamento dashboard…')).toBeTruthy();
    expect(await screen.findByText((text) => text.startsWith('120,00'))).toBeTruthy();
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(api.getDashboardPie).toHaveBeenCalledTimes(3);
  });

  it('renders zero-valued KPIs correctly', async () => {
    api.getDashboardSummary.mockResolvedValue(summary({ income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0 }));
    renderDashboard();
    await screen.findByText('Dashboard');
    await waitFor(() => expect(screen.queryByText('Caricamento dashboard…')).toBeNull());
    expect(screen.getAllByText((text) => text.startsWith('0,00'))).toHaveLength(3);
  });

  it('uses compact ranked lists instead of pie charts on a 390px viewport', async () => {
    window.innerWidth = 390;
    const mobilePie = {
      slices: [
        { label: 'Casa', value_cents: 6000 },
        { label: 'Auto', value_cents: 4000 },
      ],
      others_cents: 0,
    };
    api.getDashboardPie.mockResolvedValue(mobilePie);

    renderDashboard();

    expect(await screen.findAllByText('Casa')).toHaveLength(2);
    expect(screen.queryByTestId('pie-chart')).toBeNull();
    expect(screen.getAllByText((text) => text.startsWith('60,00'))).toHaveLength(2);
  });

  it('completes loading inside React.StrictMode', async () => {
    renderDashboard(<StrictMode><DashboardPage /></StrictMode>);
    expect(await screen.findByText((text) => text.startsWith('120,00'))).toBeTruthy();
    expect(screen.queryByText('Caricamento dashboard…')).toBeNull();
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it('shows an essential summary error', async () => {
    api.getDashboardSummary.mockRejectedValue(new Error('summary failed'));
    renderDashboard();
    expect(await screen.findByText('Impossibile caricare i dati della dashboard.')).toBeTruthy();
    expect(screen.queryByText((text) => text.startsWith('120,00'))).toBeNull();
  });

  it('shows an error only for the failed chart', async () => {
    api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) =>
      kind === 'income' ? Promise.reject(new Error('income failed')) : Promise.resolve(pie(`${dimension}-${topN}`)));
    renderDashboard();
    const alert = await screen.findByText('Impossibile caricare questa sezione.');
    expect(alert).toBeTruthy();
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
  });

  it('removes previous data only from a section that subsequently fails', async () => {
    renderDashboard();
    expect(await screen.findByText('income-category-12')).toBeTruthy();
    api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) =>
      kind === 'income' ? Promise.reject(new Error('income failed')) : Promise.resolve(pie(`${kind}-${dimension}-${topN}`)));
    fireEvent.change(screen.getByLabelText('Periodo'), { target: { value: 'currentmonth' } });
    expect(await screen.findByText('Impossibile caricare questa sezione.')).toBeTruthy();
    expect(screen.queryByText('income-category-12')).toBeNull();
  });

  it('keeps successfully loaded sections when another section fails', async () => {
    api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) =>
      kind === 'income' ? Promise.reject(new Error('income failed')) : Promise.resolve(pie(`${kind}-${dimension}-${topN}`)));
    renderDashboard();
    await screen.findByText('Impossibile caricare questa sezione.');
    expect(screen.getByText('expense-category-12')).toBeTruthy();
    expect(screen.getByTestId('bar-chart').textContent).toContain('expense-category-10');
  });

  it('retries only the endpoint for the failed section', async () => {
    api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) =>
      kind === 'income' ? Promise.reject(new Error('income failed')) : Promise.resolve(pie(`${kind}-${dimension}-${topN}`)));
    renderDashboard();
    const alert = await screen.findByText('Impossibile caricare questa sezione.');
    api.getDashboardPie.mockResolvedValueOnce(pie('Entrate recuperate'));
    await userEvent.click(within(alert.closest('[role="alert"]')).getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Entrate recuperate')).toBeTruthy();
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(api.getDashboardPie).toHaveBeenCalledTimes(4);
  });

  it('ignores stale out-of-order responses', async () => {
    const first = deferred();
    api.getDashboardSummary.mockReturnValueOnce(first.promise).mockResolvedValueOnce(summary({ income_sum_cents: 9900 }));
    renderDashboard();
    fireEvent.change(screen.getByLabelText('Periodo'), { target: { value: 'currentmonth' } });
    expect(await screen.findByText((text) => text.startsWith('99,00'))).toBeTruthy();
    first.resolve(summary({ income_sum_cents: 100 }));
    await Promise.resolve();
    expect(screen.queryByText((text) => text.startsWith('1,00'))).toBeNull();
    expect(screen.getByText((text) => text.startsWith('99,00'))).toBeTruthy();
  });

  it('does not update the DOM after unmount with pending requests', async () => {
    const pending = deferred();
    api.getDashboardSummary.mockReturnValue(pending.promise);
    api.getDashboardPie.mockReturnValue(pending.promise);
    const { unmount } = renderDashboard();
    unmount();
    pending.resolve(summary());
    await Promise.resolve();
    expect(document.body.textContent).not.toContain('120,00');
  });
});
