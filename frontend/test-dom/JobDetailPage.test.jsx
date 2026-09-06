import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import JobDetailPage from '../src/pages/JobDetailPage.jsx';
import { api } from '../src/services/api.js';
import { canPermission } from '../src/utils/permissions.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../src/services/api.js', () => ({ api: { getJob: vi.fn(), getJobReportSummary: vi.fn(), getTransactions: vi.fn(), exportJobReportCsv: vi.fn(), exportTransactions: vi.fn() } }));
vi.mock('../src/utils/permissions.js', () => ({ canPermission: vi.fn(() => true) }));
const job = { id: 5, title: 'Infissi Centro', code: 'C-005', is_active: true, is_closed: false, expectedRevenueCents: 100000, expectedCostCents: 60000, expectedMarginCents: 40000, totalIncomeCents: 80000, totalExpenseCents: 70000, actualMarginCents: 10000, revenueVarianceCents: -20000, costVarianceCents: 10000, marginVarianceCents: -30000 };
const periodSummary = { totals: { income_cents: 12000, expense_cents: 4000, margin_cents: 8000 }, by_category: [] };
const setup = () => render(<MemoryRouter initialEntries={['/jobs/5']}><Routes><Route path="/jobs/:id" element={<JobDetailPage />} /></Routes></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); canPermission.mockReturnValue(true);
  api.getJob.mockResolvedValue(job); api.getJobReportSummary.mockResolvedValue(periodSummary);
  api.getTransactions.mockResolvedValue({ data: [{ id: 1, description: 'Acconto', type: 'income', amount_total: 120, date: '2026-09-01' }], headers: new Headers({ 'X-Has-More': 'true', 'X-Total-Count': '25' }) });
});
it('keeps lifetime comparisons separate from filtered cash flows and preserves the creation context', async () => {
  setup(); await screen.findByText('Infissi Centro');
  fireEvent.change(screen.getByLabelText('pages.movements.dateFrom'), { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByText('buttons.apply'));
  await waitFor(() => expect(api.getJobReportSummary).toHaveBeenLastCalledWith('5', { date_from: '2026-09-01', date_to: '' }));
  await screen.findByText('Infissi Centro');
  const lifetime = screen.getByRole('region', { name: 'pages.jobs.lifetime' });
  expect(within(lifetime).getByText(/800,00/)).toBeTruthy();
  const period = screen.getByRole('region', { name: 'pages.jobs.period' });
  expect(within(period).getAllByText(/120,00/).length).toBeGreaterThan(0);
  expect(within(period).queryByText('pages.jobs.difference')).toBeNull();
  expect(screen.getByRole('link', { name: 'pages.movements.new' }).getAttribute('href')).toBe('/movements?job_id=5&new=1');
  expect(screen.getByLabelText('Sforamento costi').className).toContain('negative');
});
it('paginates movements without deriving totals from the current page', async () => {
  setup(); await screen.findByText('Acconto'); fireEvent.click(screen.getByText('pages.property.next'));
  await waitFor(() => expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ job_id: '5', limit: 20, offset: 20 })));
  await screen.findByText('Acconto'); expect(screen.getByText(/80,00/)).toBeTruthy();
});
it('ignores a slow response after the period changes', async () => {
  let resolveOld;
  api.getJob.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  setup(); fireEvent.change(screen.getByLabelText('pages.movements.dateFrom'), { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByText('buttons.apply')); await screen.findByText('Infissi Centro');
  resolveOld({ ...job, title: 'Obsolete' });
  await waitFor(() => expect(api.getJobReportSummary).toHaveBeenCalledTimes(1)); expect(screen.queryByText('Obsolete')).toBeNull();
});
it('retries failures and never shows stale totals as zero', async () => {
  api.getJob.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'JOB_NOT_FOUND' }));
  setup(); await screen.findByRole('alert'); expect(api.getTransactions).not.toHaveBeenCalled();
  expect(screen.queryByText('pages.jobs.lifetime')).toBeNull();
  fireEvent.click(screen.getByText('buttons.retry')); await screen.findByText('Infissi Centro');
});
it('handles inactive jobs, missing budgets and empty periods for viewers', async () => {
  canPermission.mockReturnValue(false);
  api.getJob.mockResolvedValue({ ...job, is_active: false, is_closed: true, expectedRevenueCents: null, revenueVarianceCents: null });
  api.getTransactions.mockResolvedValue({ data: [], headers: new Headers({ 'X-Total-Count': '0' }) });
  setup(); await screen.findByText('pages.jobs.emptyPeriod');
  expect(screen.getByText('labels.inactive')).toBeTruthy(); expect(screen.getAllByText('common.notSet').length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: 'pages.movements.new' })).toBeNull();
  expect(screen.queryByText('pages.jobs.exportLifetime')).toBeNull();
});
it('exports the applied period rather than draft dates and leaves lifetime exports unfiltered', async () => {
  // Fail before download to verify scope and visible recoverable errors.
  api.exportTransactions.mockRejectedValue(new Error('offline')); api.exportJobReportCsv.mockRejectedValue(new Error('offline'));
  setup(); await screen.findByText('Infissi Centro');
  fireEvent.change(screen.getByLabelText('pages.movements.dateFrom'), { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByText('pages.jobs.exportPeriod'));
  await waitFor(() => expect(api.exportTransactions).toHaveBeenCalledWith({ job_id: '5', date_from: '', date_to: '' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByText('pages.jobs.exportLifetime'));
  await waitFor(() => expect(api.exportJobReportCsv).toHaveBeenCalledWith('5', {}));
});
