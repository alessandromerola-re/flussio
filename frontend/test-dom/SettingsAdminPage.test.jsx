import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import SettingsAdminPage from '../src/pages/SettingsAdminPage.jsx';
import { api, getIsSuperAdmin, getRole } from '../src/services/api.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../src/services/api.js', () => ({ getIsSuperAdmin: vi.fn(() => true), getRole: vi.fn(() => 'super_admin'), api: Object.fromEntries(['getBranding', 'getCompanies', 'createCompany', 'deleteCompany', 'downloadBrandLogo', 'downloadBrandIcon', 'uploadBrandLogo', 'deleteBrandLogo', 'uploadBrandIcons', 'deleteBrandIcons', 'importMovementsCsv'].map((key) => [key, vi.fn()])) }));
const setup = () => render(<MemoryRouter><SettingsAdminPage /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); getIsSuperAdmin.mockReturnValue(true); getRole.mockReturnValue('super_admin');
  api.getBranding.mockResolvedValue({ has_logo: false }); api.getCompanies.mockResolvedValue([{ id: 1, name: 'One' }]);
  api.createCompany.mockResolvedValue({ id: 2 }); api.deleteCompany.mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});
it('keeps a single import path and hides technical icon details initially', async () => {
  setup(); await screen.findByText('One');
  expect(screen.getByRole('link', { name: 'nav.movements' }).getAttribute('href')).toBe('/movements');
  expect(screen.queryByText('CSV')).toBeNull();
  expect(screen.getByText('adminUx.advanced').closest('details').open).toBe(false);
  expect(api.importMovementsCsv).not.toHaveBeenCalled();
});
it('requires the exact company name and prevents duplicate deletion', async () => {
  let resolve; api.deleteCompany.mockReturnValue(new Promise((done) => { resolve = done; }));
  setup(); await screen.findByText('One'); fireEvent.click(screen.getByText('buttons.delete'));
  const dialog = screen.getByRole('dialog'); const button = within(dialog).getByRole('button', { name: 'buttons.delete' });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('adminUx.typeCompanyName'), { target: { value: 'One' } });
  fireEvent.click(button); fireEvent.click(button);
  expect(api.deleteCompany).toHaveBeenCalledTimes(1); expect(api.deleteCompany).toHaveBeenCalledWith(1);
  resolve({}); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('keeps deletion failures inside the dialog', async () => {
  api.deleteCompany.mockRejectedValue(new Error('offline'));
  setup(); await screen.findByText('One'); fireEvent.click(screen.getByText('buttons.delete'));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(screen.getByLabelText('adminUx.typeCompanyName'), { target: { value: 'One' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'buttons.delete' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
});
it('does not expose company management to an ordinary administrator', async () => {
  getIsSuperAdmin.mockReturnValue(false); getRole.mockReturnValue('admin');
  setup(); await waitFor(() => expect(api.getBranding).toHaveBeenCalled());
  expect(api.getCompanies).not.toHaveBeenCalled(); expect(screen.queryByText('pages.settings.companiesTitle')).toBeNull();
});

it('does not allocate preview URLs when an asset finishes after unmount', async () => {
  let resolve;
  api.getBranding.mockResolvedValue({ has_logo: true });
  api.downloadBrandLogo.mockReturnValue(new Promise((done) => { resolve = done; }));
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  const view = setup(); await waitFor(() => expect(api.downloadBrandLogo).toHaveBeenCalled());
  view.unmount();
  await act(async () => { resolve(new Blob(['test'])); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('requires confirmation before resetting custom icons', async () => {
  api.getBranding.mockResolvedValue({ icons: { has_custom: true } });
  setup(); await screen.findByText('One');
  fireEvent.click(screen.getByText('pages.settings.restoreDefaultIcons'));
  expect(window.confirm).toHaveBeenCalledWith('adminUx.resetIconsConfirm');
  expect(api.deleteBrandIcons).not.toHaveBeenCalled();
});
