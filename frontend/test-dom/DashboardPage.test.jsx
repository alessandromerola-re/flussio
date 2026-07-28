import React, { StrictMode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '../src/pages/DashboardPage.jsx';
import { api } from '../src/services/api.js';

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: {}, BarElement: {}, CategoryScale: {}, Legend: {}, LineElement: {},
  LinearScale: {}, PointElement: {}, Tooltip: {},
}));

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }) => <div data-testid="line-chart">{data.labels.join(',')}</div>,
  Pie: ({ data }) => <div data-testid="pie-chart">{data.labels.join(',')}</div>,
  Bar: ({ data }) => <div data-testid="bar-chart">{data.labels.join(',')}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => ({
      'pages.dashboard.title': 'Dashboard', 'pages.dashboard.period': 'Periodo',
      'pages.dashboard.income': 'Entrate', 'pages.dashboard.expense': 'Uscite',
      'pages.dashboard.net': 'Netto', 'pages.dashboard.topExpensesByCategory': 'Top uscite per categoria',
      'pages.dashboard.dim.category': 'Categoria', 'pages.dashboard.dim.contact': 'Contatto',
      'pages.dashboard.dim.account': 'Conto', 'pages.dashboard.dim.job': 'Commessa',
      'pages.dashboard.other': 'Altro', 'common.none': 'Nessun dato',
    }[key] || key),
  }),
}));

vi.mock('../src/services/api.js', () => ({
  api: { getDashboardSummary: vi.fn(), getDashboardPie: vi.fn() },
}));

const summary = (overrides = {}) => ({
  income_sum_cents: 12500,
  expense_sum_cents: -4500,
  net_sum_cents: 8000,
  by_bucket: [{ label: 'Luglio', income_sum_cents: 12500, expense_sum_cents: -4500, net_sum_cents: 8000 }],
  previous: { income_sum_cents: 10000, expense_sum_cents: -5000, net_sum_cents: 5000 },
  ...overrides,
});

const pie = (label, value = 1000) => ({ slices: [{ label, value_cents: value }], others_cents: 0 });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const sectionFor = (heading) => screen.getByRole('heading', { name: heading }).closest('.card');

beforeEach(() => {
  api.getDashboardSummary.mockResolvedValue(summary());
  api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) => {
    if (topN === 10) return Promise.resolve(pie('Affitto'));
    return Promise.resolve(pie(`${kind}-${dimension}`));
  });
});

afterEach(() => cleanup());

describe('DashboardPage DOM lifecycle', () => {
  it('loads initially and then displays API data', async () => {
    render(<DashboardPage />);
    expect(screen.getByText('Caricamento dashboard…')).toBeTruthy();
    expect(await screen.findByText('€ 125.00')).toBeTruthy();
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(api.getDashboardPie).toHaveBeenCalledTimes(3);
    expect(screen.getAllByTestId('line-chart')[0].textContent).toContain('Luglio');
  });

  it('finishes loading and renders zero-valued KPIs', async () => {
    api.getDashboardSummary.mockResolvedValue(summary({ income_sum_cents: 0, expense_sum_cents: 0, net_sum_cents: 0, by_bucket: [] }));
    render(<DashboardPage />);
    expect((await screen.findAllByText('€ 0.00')).length).toBe(3);
    expect(screen.queryByText('Caricamento dashboard…')).toBeNull();
  });

  it('completes the second StrictMode setup instead of remaining loading', async () => {
    render(<StrictMode><DashboardPage /></StrictMode>);
    expect(await screen.findByText('€ 125.00')).toBeTruthy();
    expect(screen.queryByText('Caricamento dashboard…')).toBeNull();
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(2);
    expect(api.getDashboardPie).toHaveBeenCalledTimes(6);
  });

  it('shows a general error when the essential summary fails', async () => {
    api.getDashboardSummary.mockRejectedValue(new Error('summary failed'));
    render(<DashboardPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Impossibile caricare i dati della dashboard.');
    expect(screen.queryByText('€ 125.00')).toBeNull();
  });

  it('keeps KPIs and successful sections visible when one chart fails', async () => {
    api.getDashboardPie.mockImplementation(({ kind, topN }) => kind === 'income' && topN === 12
      ? Promise.reject(new Error('income failed'))
      : Promise.resolve(pie(topN === 10 ? 'Affitto' : 'Spesa')));
    render(<DashboardPage />);
    expect(await screen.findByText('€ 125.00')).toBeTruthy();
    expect(within(sectionFor('Entrate per')).getByRole('alert')).toBeTruthy();
    expect(within(sectionFor('Uscite per')).getByText('Spesa')).toBeTruthy();
    expect(within(sectionFor('Top uscite per categoria')).getByTestId('bar-chart').textContent).toContain('Affitto');
  });

  it('clears only the failed section previous data on a later load', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    expect(await within(sectionFor('Entrate per')).findByText('income-category')).toBeTruthy();
    api.getDashboardPie.mockImplementation(({ kind, topN }) => kind === 'income' && topN === 12
      ? Promise.reject(new Error('income failed'))
      : Promise.resolve(pie(topN === 10 ? 'Affitto nuovo' : 'Uscita nuova')));
    await user.click(within(sectionFor('Entrate per')).getByRole('button', { name: 'Contatto' }));
    expect(await within(sectionFor('Entrate per')).findByRole('alert')).toBeTruthy();
    expect(within(sectionFor('Entrate per')).queryByText('income-category')).toBeNull();
    expect(within(sectionFor('Uscite per')).getByText('Uscita nuova')).toBeTruthy();
  });

  it('section retry calls only its own endpoint', async () => {
    const user = userEvent.setup();
    api.getDashboardPie.mockImplementation(({ kind, topN }) => kind === 'income' && topN === 12
      ? Promise.reject(new Error('income failed')) : Promise.resolve(pie('ok')));
    render(<DashboardPage />);
    const retry = await within(sectionFor('Entrate per')).findByRole('button', { name: 'Riprova' });
    const summaryCalls = api.getDashboardSummary.mock.calls.length;
    const pieCalls = api.getDashboardPie.mock.calls.length;
    await user.click(retry);
    await waitFor(() => expect(api.getDashboardPie).toHaveBeenCalledTimes(pieCalls + 1));
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(summaryCalls);
    expect(api.getDashboardPie.mock.calls.at(-1)[0]).toMatchObject({ kind: 'income', dimension: 'category', topN: 12 });
  });

  it('successful retry removes its error and displays fresh data', async () => {
    const user = userEvent.setup();
    let failIncome = true;
    api.getDashboardPie.mockImplementation(({ kind, topN }) => {
      if (kind === 'income' && topN === 12 && failIncome) return Promise.reject(new Error('income failed'));
      return Promise.resolve(pie(kind === 'income' ? 'Nuovo cliente' : 'ok'));
    });
    render(<DashboardPage />);
    const card = sectionFor('Entrate per');
    const retry = await within(card).findByRole('button', { name: 'Riprova' });
    failIncome = false;
    await user.click(retry);
    expect(await within(card).findByText('Nuovo cliente')).toBeTruthy();
    expect(within(card).queryByRole('alert')).toBeNull();
  });

  it('ignores an obsolete response that arrives out of order', async () => {
    const user = userEvent.setup();
    const oldIncome = deferred();
    let deferContact = true;
    api.getDashboardPie.mockImplementation(({ kind, dimension, topN }) => {
      if (kind === 'income' && dimension === 'contact' && topN === 12 && deferContact) {
        deferContact = false;
        return oldIncome.promise;
      }
      return Promise.resolve(pie(dimension === 'contact' ? 'Risposta nuova' : 'ok'));
    });
    render(<DashboardPage />);
    await screen.findByText('€ 125.00');
    await user.click(within(sectionFor('Entrate per')).getByRole('button', { name: 'Contatto' }));
    await user.selectOptions(screen.getByLabelText('Periodo'), 'currentmonth');
    expect(await within(sectionFor('Entrate per')).findByText('Risposta nuova')).toBeTruthy();
    oldIncome.resolve(pie('Risposta obsoleta'));
    await waitFor(() => expect(within(sectionFor('Entrate per')).queryByText('Risposta obsoleta')).toBeNull());
    expect(within(sectionFor('Entrate per')).getByText('Risposta nuova')).toBeTruthy();
  });

  it('does not update after unmount while requests are pending', async () => {
    const pending = deferred();
    api.getDashboardSummary.mockReturnValue(pending.promise);
    api.getDashboardPie.mockReturnValue(pending.promise);
    const view = render(<DashboardPage />);
    expect(screen.getByText('Caricamento dashboard…')).toBeTruthy();
    view.unmount();
    pending.resolve(summary());
    await pending.promise;
    await Promise.resolve();
    expect(view.container.innerHTML).toBe('');
  });
});
