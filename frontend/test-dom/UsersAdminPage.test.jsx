import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import UsersAdminPage from '../src/pages/UsersAdminPage.jsx';
import { api, getIsSuperAdmin } from '../src/services/api.js';
import { canPermission } from '../src/utils/permissions.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../src/utils/permissions.js', () => ({ canPermission: vi.fn(() => true) }));
vi.mock('../src/services/api.js', () => ({ getIsSuperAdmin: vi.fn(() => true), getActiveCompanyId: () => 1, api: Object.fromEntries(['getUsers', 'getCompanies', 'getUser', 'createUser', 'updateUser', 'createResetToken'].map((key) => [key, vi.fn()])) }));
const user = { id: 2, email: 'user@example.test', role: 'viewer', is_active: false, membership_active: true };
beforeEach(() => {
  vi.clearAllMocks(); canPermission.mockReturnValue(true); getIsSuperAdmin.mockReturnValue(true);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.getUsers.mockResolvedValue([user]);
  api.getCompanies.mockResolvedValue([{ id: 1, name: 'One' }]);
  api.getUser.mockResolvedValue({ ...user, memberships: [{ company_id: 1, role: 'viewer', is_active: true }] });
  api.createUser.mockResolvedValue({ id: 3 }); api.updateUser.mockResolvedValue(user);
});
it('translates roles and distinguishes company access from global status', async () => {
  render(<UsersAdminPage />); await screen.findByText(user.email);
  expect(screen.getByText('adminUx.roles.viewer')).toBeTruthy();
  expect(screen.getByText('adminUx.accessActive')).toBeTruthy();
  expect(screen.getByText('adminUx.globalInactive')).toBeTruthy();
});
it('hides add-access with one company and prevents duplicate choices with two', async () => {
  api.getCompanies.mockResolvedValue([{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]);
  render(<UsersAdminPage />); await screen.findByText(user.email);
  fireEvent.click(screen.getByText('buttons.new'));
  fireEvent.click(screen.getByText('pages.users.addCompanyAccess'));
  expect(screen.queryByText('pages.users.addCompanyAccess')).toBeNull();
  expect(screen.getByLabelText('pages.users.selectCompany 2').value).toBe('2');
  expect(within(screen.getByLabelText('pages.users.selectCompany 2')).getByText('One').disabled).toBe(true);
});
it('does not offer a second access when only one company exists', async () => {
  render(<UsersAdminPage />); await screen.findByText(user.email); fireEvent.click(screen.getByText('buttons.new'));
  expect(screen.queryByText('pages.users.addCompanyAccess')).toBeNull();
});
it('requires confirmation before disabling company access', async () => {
  window.confirm.mockReturnValue(false);
  render(<UsersAdminPage />); await screen.findByText(user.email); fireEvent.click(screen.getByText('buttons.deactivate'));
  await waitFor(() => expect(window.confirm).toHaveBeenCalled());
  expect(api.updateUser).not.toHaveBeenCalled();
});
it('keeps reset secrets masked inside a dedicated dialog and clears them on close', async () => {
  api.createResetToken.mockResolvedValue({ token: 'fixture-only-reset-code', expires_at: '2026-09-06T22:00:00Z' });
  render(<UsersAdminPage />); await screen.findByText(user.email); fireEvent.click(screen.getByText('pages.users.generateReset'));
  const input = await screen.findByLabelText('pages.users.resetToken');
  expect(input.type).toBe('password');
  fireEvent.click(screen.getByText('adminUx.showToken')); expect(input.type).toBe('text');
  fireEvent.click(screen.getByText('buttons.close'));
  expect(screen.queryByDisplayValue('fixture-only-reset-code')).toBeNull();
});
it('catches reset failures and prevents duplicate requests while pending', async () => {
  let reject; api.createResetToken.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  render(<UsersAdminPage />); await screen.findByText(user.email);
  const button = screen.getByText('pages.users.generateReset'); fireEvent.click(button); fireEvent.click(button);
  expect(api.createResetToken).toHaveBeenCalledTimes(1);
  reject(new Error('offline')); await screen.findByRole('alert');
});
it('retries failed initial loading and makes no requests for viewers', async () => {
  api.getUsers.mockRejectedValueOnce(new Error('offline'));
  const view = render(<UsersAdminPage />); await screen.findByRole('alert');
  fireEvent.click(screen.getByText('buttons.retry')); await screen.findByText(user.email);
  view.unmount(); api.getUsers.mockClear(); canPermission.mockReturnValue(false);
  render(<UsersAdminPage />); expect(api.getUsers).not.toHaveBeenCalled();
});

it('does not claim email delivery when the API returns no reset code', async () => {
  api.createResetToken.mockResolvedValue({ token: null, delivery: 'email' });
  render(<UsersAdminPage />); await screen.findByText(user.email);
  fireEvent.click(screen.getByText('pages.users.generateReset'));
  expect(await screen.findByText('adminUx.resetDeliveryUnconfirmed')).toBeTruthy();
  expect(screen.queryByText('pages.users.resetByEmail')).toBeNull();
});

it('keeps company administrators scoped to their company when saving', async () => {
  getIsSuperAdmin.mockReturnValue(false);
  localStorage.setItem('flussio_companies', JSON.stringify([{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]));
  render(<UsersAdminPage />); await screen.findByText(user.email);
  fireEvent.click(screen.getByText('buttons.edit'));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('forms.email').disabled).toBe(true);
  expect(screen.queryByText('adminUx.globalActive')).toBeNull();
  expect(screen.queryByText('pages.users.addCompanyAccess')).toBeNull();
  fireEvent.submit(dialog.querySelector('form'));
  await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(2, { memberships: [{ company_id: 1, role: 'viewer', is_active: true }] }));
});
