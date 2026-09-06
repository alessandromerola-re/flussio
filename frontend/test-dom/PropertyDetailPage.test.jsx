import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import PropertyDetailPage from '../src/pages/PropertyDetailPage.jsx';
import { api } from '../src/services/api.js';
import { canPermission } from '../src/utils/permissions.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../src/services/api.js', () => ({ api: { getProperty: vi.fn(), getTransactions: vi.fn() } }));
vi.mock('../src/utils/permissions.js', () => ({ canPermission: vi.fn(() => true) }));
const property = { id: 5, name: 'Casa Centro', external_id: 'IMM-000005', address: 'Via Roma 1', income: '2100.10', expense: '100.05', net: '2000.05', movement_count: 21, is_active: true };
const setup = () => render(<MemoryRouter initialEntries={['/registry/properties/5']}><Routes><Route path="/registry/properties/:id" element={<PropertyDetailPage />} /></Routes></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); canPermission.mockReturnValue(true);
  api.getProperty.mockResolvedValue(property);
  api.getTransactions.mockResolvedValue({ data: [{ id: 1, description: 'Canone', type: 'income', amount_total: 100, date: '2026-09-01' }], headers: new Headers({ 'X-Has-More': 'true' }) });
});
it('keeps complete totals on the second page and preselects property on creation', async () => {
  setup(); await screen.findByText('Via Roma 1');
  expect(screen.getByText(/2\.?100,10/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'pages.movements.new' }).getAttribute('href')).toBe('/movements?property_id=5&new=1');
  fireEvent.click(screen.getByText('pages.property.next'));
  await waitFor(() => expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ property_id: '5', offset: 20 })));
  expect(await screen.findByText(/2\.?100,10/)).toBeTruthy();
});
it('applies the same period to totals and movements', async () => {
  setup(); await screen.findByText('Canone');
  fireEvent.change(screen.getByLabelText('pages.property.from'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('pages.property.to'), { target: { value: '2026-09-30' } });
  fireEvent.click(screen.getByText('pages.property.apply'));
  await waitFor(() => expect(api.getProperty).toHaveBeenLastCalledWith('5', { date_from: '2026-09-01', date_to: '2026-09-30' }));
  await waitFor(() => expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ date_from: '2026-09-01', date_to: '2026-09-30', offset: 0 })));
});
it('retries a missing property without misleading zero totals', async () => {
  api.getProperty.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'NOT_FOUND' }));
  setup(); await screen.findByRole('alert');
  expect(api.getTransactions).not.toHaveBeenCalled();
  expect(screen.queryByText('pages.property.cashflow')).toBeNull();
  fireEvent.click(screen.getByText('buttons.retry')); expect(await screen.findByText('Canone')).toBeTruthy();
});
it('ignores a late result for an older period', async () => {
  let finishOld;
  api.getProperty.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }));
  setup(); fireEvent.change(screen.getByLabelText('pages.property.from'), { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByText('pages.property.apply'));
  await screen.findByText('Casa Centro'); finishOld({ ...property, name: 'Obsolete' });
  await waitFor(() => expect(api.getTransactions).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Obsolete')).toBeNull();
});
it('shows empty periods and hides creation from viewers', async () => {
  canPermission.mockReturnValue(false); api.getTransactions.mockResolvedValue({ data: [], headers: new Headers() });
  api.getProperty.mockResolvedValue({ ...property, income: '0', expense: '0', net: '0', movement_count: 0 });
  setup(); await screen.findByText('pages.property.empty');
  expect(screen.queryByRole('link', { name: 'pages.movements.new' })).toBeNull();
});
