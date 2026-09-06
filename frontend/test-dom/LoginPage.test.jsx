import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import LoginPage from '../src/pages/LoginPage.jsx';
import routes from '../src/routes.jsx';
import { api, setToken, setActiveCompanyId } from '../src/services/api.js';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock('../src/services/api.js', () => ({ api: { login: vi.fn() }, setToken: vi.fn(), setActiveCompanyId: vi.fn(), getRole: () => 'admin' }));
const onLogin = vi.fn();
const setup = () => render(<MemoryRouter initialEntries={['/login']}><Routes>
  <Route path="/login" element={<LoginPage onLogin={onLogin} />} />
  <Route path="/dashboard" element={<p>Dashboard destination</p>} />
</Routes></MemoryRouter>);
const fill = () => {
  fireEvent.change(screen.getByLabelText('forms.email'), { target: { value: 'test@example.test' } });
  fireEvent.change(screen.getByLabelText('forms.password'), { target: { value: 'fixture-only-password' } });
};
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
it('keeps password visibility inside the field without losing its value and collapses help', () => {
  setup(); fill(); const input = screen.getByLabelText('forms.password');
  const toggle = screen.getByRole('button', { name: 'forms.showPassword' });
  expect(toggle.parentElement).toBe(input.parentElement);
  expect(toggle.getAttribute('aria-controls')).toBe(input.id);
  fireEvent.click(toggle); expect(input.type).toBe('text'); expect(input.value).toBe('fixture-only-password');
  fireEvent.click(screen.getByRole('button', { name: 'forms.hidePassword' })); expect(input.type).toBe('password');
  expect(screen.getByText('pages.login.firstAccessTitle').closest('details').open).toBe(false);
  expect(api.login).not.toHaveBeenCalled();
});
it('submits once, preserves remember mode and navigates on success', async () => {
  let resolve; api.login.mockReturnValue(new Promise((done) => { resolve = done; }));
  setup(); fill(); fireEvent.click(screen.getByLabelText('forms.rememberMe'));
  const form = screen.getByRole('button', { name: 'buttons.login' }).closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(api.login).toHaveBeenCalledTimes(1);
  expect(api.login).toHaveBeenCalledWith({ email: 'test@example.test', password: 'fixture-only-password', remember: false });
  expect(screen.getByLabelText('forms.email').disabled).toBe(true);
  await act(async () => { resolve({ token: 'fixture-session', role: 'admin', default_company_id: 1, companies: [] }); });
  await screen.findByText('Dashboard destination');
  expect(setToken).toHaveBeenCalledWith('fixture-session', 'admin', false);
  expect(setActiveCompanyId).toHaveBeenCalledWith(1);
  expect(onLogin).toHaveBeenCalledTimes(1);
});
it('shows failed login feedback and allows another attempt', async () => {
  api.login.mockRejectedValueOnce(new Error('offline'));
  setup(); fill(); fireEvent.click(screen.getByRole('button', { name: 'buttons.login' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'buttons.login' }).disabled).toBe(false);
  expect(setToken).not.toHaveBeenCalled();
});
it('does not apply a late login response after leaving the page', async () => {
  let resolve; api.login.mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = setup(); fill(); fireEvent.click(screen.getByRole('button', { name: 'buttons.login' }));
  view.unmount();
  await act(async () => { resolve({ token: 'fixture-session', role: 'admin' }); });
  expect(setToken).not.toHaveBeenCalled(); expect(onLogin).not.toHaveBeenCalled();
});
it.each([['fixture-session', '/dashboard'], [null, '/login']])('redirects retired roadmap links with token %s', async (token, destination) => {
  const entry = routes({ token, setTokenState: vi.fn() }).find((route) => route.path === '/roadmap');
  render(<MemoryRouter initialEntries={['/roadmap']}><Routes>
    <Route path="/roadmap" element={entry.element} />
    <Route path={destination} element={<p>Expected destination</p>} />
  </Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Expected destination')).toBeTruthy());
});
