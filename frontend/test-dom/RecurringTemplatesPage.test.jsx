import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import RecurringTemplatesPage from '../src/pages/RecurringTemplatesPage.jsx';
import { api } from '../src/services/api.js';
import { canPermission } from '../src/utils/permissions.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../src/utils/permissions.js', () => ({ canPermission: vi.fn(() => true) }));
vi.mock('../src/services/api.js', () => ({ api: Object.fromEntries(['getRecurringTemplates','getRecurringStatus','getRecurringRuns','getAccounts','getCategories','getContacts','getProperties','getJobs','createRecurringTemplate','updateRecurringTemplate','generateRecurringDue','generateRecurringTemplateNow'].map((key) => [key, vi.fn()])) }));
const template = { id: 4, title: 'Affitto', frequency: 'monthly', interval: 1, start_date: '2026-09-01', amount: 100, movement_type: 'income', account_id: 1, account_name: 'Banca', is_active: true, next_run_at: '2026-10-01' };
const setup = () => render(<MemoryRouter><RecurringTemplatesPage /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); canPermission.mockReturnValue(true);
  api.getRecurringTemplates.mockResolvedValue([template]); api.getRecurringStatus.mockResolvedValue({ generator_enabled: false });
  api.getAccounts.mockResolvedValue([{ id: 1, name: 'Banca', is_active: true }]);
  for (const key of ['getCategories','getContacts','getProperties','getJobs']) api[key].mockResolvedValue([]);
  api.createRecurringTemplate.mockResolvedValue({ id: 5 }); api.updateRecurringTemplate.mockResolvedValue(template);
  api.getRecurringRuns.mockResolvedValue({ rows: [{ id: 1, cycle_key: '2026-09', run_at: '2026-09-01', run_type: 'auto', generated_movement_id: 9 }], has_more: true });
});
it('keeps generation off and filters templates without executing anything', async () => {
  setup(); await screen.findByText('Affitto');
  expect(screen.getByText('pages.recurring.generatorOff')).toBeTruthy();
  expect(screen.getByText('buttons.generateDue').disabled).toBe(true);
  expect(screen.getByText('buttons.generateNow').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('forms.search'), { target: { value: 'missing' } });
  expect(screen.getByText('pages.registry.noResults')).toBeTruthy();
  expect(api.generateRecurringDue).not.toHaveBeenCalled(); expect(api.generateRecurringTemplateNow).not.toHaveBeenCalled();
});
it('opens a clean mobile form after editing and provides a visible save button', async () => {
  setup(); await screen.findByText('Affitto'); fireEvent.click(screen.getByText('buttons.edit'));
  expect(within(screen.getByRole('dialog')).getByLabelText('forms.name').value).toBe('Affitto');
  fireEvent.click(screen.getByLabelText('Chiudi finestra'));
  fireEvent.click(screen.getByText('buttons.new'));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('forms.name').value).toBe('');
  expect(within(dialog).getByText('buttons.save').className).not.toContain('desktop-only');
  fireEvent.change(within(dialog).getByLabelText('forms.name'), { target: { value: 'Nuova' } });
  fireEvent.change(within(dialog).getByLabelText('pages.movements.amount'), { target: { value: '25' } });
  fireEvent.change(within(dialog).getByLabelText('pages.movements.account'), { target: { value: '1' } });
  fireEvent.submit(dialog.querySelector('form'));
  await waitFor(() => expect(api.createRecurringTemplate).toHaveBeenCalledTimes(1));
  expect(api.updateRecurringTemplate).not.toHaveBeenCalled();
});
it('paginates execution history and links to the exact generated movement', async () => {
  setup(); await screen.findByText('Affitto'); fireEvent.click(screen.getByText('pages.recurring.history'));
  const link = await screen.findByRole('link', { name: 'pages.movements.open #9' });
  expect(link.getAttribute('href')).toBe('/movements?transaction_id=9');
  fireEvent.click(screen.getByText('pages.property.next'));
  await waitFor(() => expect(api.getRecurringRuns).toHaveBeenLastCalledWith(4, 20));
});
it('retries a failed load and prevents creation until configuration is available', async () => {
  api.getAccounts.mockRejectedValueOnce(new Error('offline'));
  setup(); await screen.findByRole('alert'); expect(screen.getByText('buttons.new').disabled).toBe(true);
  fireEvent.click(screen.getByText('buttons.retry')); await screen.findByText('Affitto');
});
it('allows viewers to inspect history without showing mutation controls', async () => {
  canPermission.mockReturnValue(false); setup(); await screen.findByText('Affitto');
  expect(screen.queryByText('buttons.new')).toBeNull(); expect(screen.queryByText('buttons.edit')).toBeNull();
  expect(screen.getByText('pages.recurring.history')).toBeTruthy();
});
