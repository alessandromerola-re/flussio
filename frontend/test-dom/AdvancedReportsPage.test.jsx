import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AdvancedReportsPage from '../src/pages/AdvancedReportsPage.jsx';
import { api } from '../src/services/api.js';
import { ADV_REPORT_TEMPLATES } from '../src/utils/advancedReportTemplates.js';
vi.mock('react-i18next', () => { const t = (key) => key; return { useTranslation: () => ({ t }) }; });
vi.mock('../src/utils/permissions.js', () => ({ canPermission: () => true }));
vi.mock('../src/services/api.js', () => ({ api: Object.fromEntries(['getAccounts','getCategories','getContacts','getJobs','getProperties','listSavedReports','runAdvancedReport','exportAdvancedReportCsv'].map((key) => [key, vi.fn()])) }));
const Location = () => <output data-testid="location">{useLocation().search}</output>;
const setup = () => render(<MemoryRouter><AdvancedReportsPage /><Location /></MemoryRouter>);
const response = (spec, rows = [{ bucket: '2026-09', income_sum_cents: 10000, expense_sum_cents: 2000, net_sum_cents: 8000, count: 2 }]) => ({ spec, rows, totals: { income_sum_cents: 10000, expense_sum_cents: 2000, net_sum_cents: 8000, count: 2 } });
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ['getAccounts','getCategories','getContacts','getJobs','getProperties','listSavedReports']) api[key].mockResolvedValue([]);
  api.runAdvancedReport.mockImplementation(async (spec) => response(spec));
  api.exportAdvancedReportCsv.mockRejectedValue(new Error('offline'));
});
it('keeps export and result columns bound to the applied configuration after edits', async () => {
  setup(); expect(screen.getByText('buttons.exportCsv').disabled).toBe(true);
  fireEvent.click(screen.getByText('buttons.runReport')); await screen.findByRole('table');
  const applied = api.runAdvancedReport.mock.calls[0][0];
  fireEvent.change(screen.getByLabelText('pages.movements.dateFrom'), { target: { value: '2026-01-01' } });
  fireEvent.click(screen.getByLabelText('pages.reportsAdvanced.metrics.count'));
  expect(screen.getByText('reportsIntegrity.unapplied')).toBeTruthy();
  expect(within(screen.getByRole('table')).getByText('pages.reportsAdvanced.metrics.count')).toBeTruthy();
  fireEvent.click(screen.getByText('buttons.exportCsv'));
  await waitFor(() => expect(api.exportAdvancedReportCsv).toHaveBeenCalledWith(applied));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByLabelText('Apri movimenti riga 1'));
  expect(screen.getByTestId('location').textContent).toContain(`date_from=${applied.dateFrom}`);
});
it('does not mark a time aggregate as missing a category', async () => {
  setup(); fireEvent.click(screen.getByText('buttons.runReport')); await screen.findByRole('table');
  expect(screen.getByRole('table').querySelector('tbody tr').style.backgroundColor).toBe('');
});
it('marks missing links only for a selected entity dimension', async () => {
  api.runAdvancedReport.mockImplementation(async (spec) => response(spec, [{ contact_id: null, contact_name: 'Missing contact', count: 1 }]));
  setup(); fireEvent.change(screen.getByLabelText('pages.reportsAdvanced.groupBy1'), { target: { value: 'contact' } });
  fireEvent.click(screen.getByText('buttons.runReport')); await screen.findByRole('table');
  expect(screen.getByRole('table').querySelector('tbody tr').style.backgroundColor).not.toBe('');
});
it('ignores older template responses and preserves edits made while running', async () => {
  const pending = [];
  api.runAdvancedReport.mockImplementation((spec) => new Promise((resolve) => pending.push({ spec, resolve })));
  setup();
  fireEvent.click(screen.getByText(ADV_REPORT_TEMPLATES[0].titleKey));
  fireEvent.click(screen.getByText(ADV_REPORT_TEMPLATES[1].titleKey));
  fireEvent.change(screen.getByLabelText('pages.movements.dateFrom'), { target: { value: '2025-01-01' } });
  await act(async () => { pending[1].resolve(response(pending[1].spec, [{ bucket: 'NEW', count: 1 }])); });
  await act(async () => { pending[0].resolve(response(pending[0].spec, [{ bucket: 'OLD', count: 1 }])); });
  expect(within(screen.getByRole('table')).getByText('NEW')).toBeTruthy();
  expect(screen.queryByText('OLD')).toBeNull();
  expect(screen.getByLabelText('pages.movements.dateFrom').value).toBe('2025-01-01');
});
it('clears old results on a new failing run and disables export', async () => {
  setup(); fireEvent.click(screen.getByText('buttons.runReport')); await screen.findByRole('table');
  api.runAdvancedReport.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByText('buttons.runReport')); await screen.findByRole('alert');
  expect(screen.queryByRole('table')).toBeNull(); expect(screen.getByText('buttons.exportCsv').disabled).toBe(true);
});

it('downloads one CSV and releases its URL after a successful export', async () => {
  api.exportAdvancedReportCsv.mockResolvedValue({ blob: new Blob(['count\n2']), headers: new Headers({ 'content-disposition': 'attachment; filename="report.csv"' }) });
  URL.createObjectURL = vi.fn(() => 'blob:report'); URL.revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  setup(); fireEvent.click(screen.getByText('buttons.runReport')); await screen.findByRole('table');
  fireEvent.click(screen.getByText('buttons.exportCsv')); fireEvent.click(screen.getByText('buttons.exportCsv'));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(api.exportAdvancedReportCsv).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report');
  click.mockRestore();
});
