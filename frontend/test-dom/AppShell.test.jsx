import { moduleProfile } from './helpers/moduleRender.jsx';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import SettingsAdminPage from '../src/pages/SettingsAdminPage.jsx';
import { api } from '../src/services/api.js';
import { writeCompanies } from '../src/utils/companyStorage.js';

vi.mock('../src/routes.jsx', () => ({
  default: ({ token }) => [
    { path: '/dashboard', element: token ? <div>Dashboard content<input aria-label="Page draft" defaultValue="" /></div> : <div>Login content</div> },
    { path: '/settings', element: <SettingsAdminPage /> },
    { path: '*', element: <div>Fallback content</div> },
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => ({
    'nav.dashboard': 'Dashboard',
    'nav.movements': 'Movimenti',
    'nav.registry': 'Anagrafiche',
    'nav.reportsAdvanced': 'Report avanzati',
    'nav.reportsShort': 'Report',
    'nav.users': 'Utenti',
    'nav.settings': 'Impostazioni',
    'nav.roadmap': 'Roadmap',
    'nav.firstNote': 'Prima nota',
    'nav.administration': 'Amministrazione',
    'nav.logout': 'Esci',
    'nav.openMenu': 'Apri menu',
    'nav.openAccountMenu': 'Apri menu account',
    'nav.closeMenu': 'Chiudi menu',
    'nav.mainMenu': 'Menu principale',
    'nav.mainContent': 'Contenuto principale',
    'nav.quickNavigation': 'Navigazione rapida',
    'nav.more': 'Altro',
    'common.company': 'Azienda',
    'common.language': 'Lingua',
    'common.user': 'Utente',
  }[key] || key) }),
}));

vi.mock('../src/utils/permissions.js', () => ({
  can: () => true,
  isRecurringEnabled: () => false,
}));

vi.mock('../src/services/publicBranding.js', () => ({ bootstrapPublicBrandingIcons: vi.fn() }));
vi.mock('../src/i18n/index.js', () => ({ setLanguage: vi.fn() }));

const jwt = (payload) => `header.${btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

const renderApp = () => render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  localStorage.setItem('flussio_token', jwt({ user_id: 1, email: 'utente@example.it', is_super_admin: true }));
  localStorage.setItem('flussio_role', 'admin');
  localStorage.setItem('flussio_company_id', '1');
  localStorage.setItem('flussio_companies', JSON.stringify([
    { id: 1, name: 'Windome', role: 'admin' },
    { id: 2, name: 'Famiglia', role: 'editor' },
  ]));
  vi.spyOn(api, 'getCurrentCapabilities').mockImplementation(async () => moduleProfile({company:Number(localStorage.getItem('flussio_company_id'))}));
  vi.spyOn(api, 'getBranding').mockResolvedValue({ has_logo: false, icons: { variants: {} } });
  vi.spyOn(api, 'logout').mockResolvedValue(null);
});

describe('App mobile-first shell', () => {
  it('exposes grouped navigation and the five-item quick mobile navigation', async () => {
    renderApp();
    expect(screen.getByRole('navigation', { name: 'Navigazione rapida' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navigazione rapida' }).querySelectorAll('a,button')).toHaveLength(5);
    expect(screen.getByText('Prima nota')).toBeTruthy();
    expect(screen.getByText('Amministrazione')).toBeTruthy();
    expect(await screen.findByText('Dashboard content')).toBeTruthy();
  });

  it('opens and closes a focusable mobile drawer', async () => {
    renderApp();
    expect(screen.queryByLabelText('Menu principale')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apri menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu principale' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Chiudi menu' })));
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi menu' }));
    await waitFor(() => expect(screen.queryByLabelText('Menu principale')).toBeNull());
  });

  it('switches company context and role without assigning window.location', async () => {
    renderApp();
    const selectors = screen.getAllByLabelText('Azienda');
    fireEvent.change(selectors[0], { target: { value: '2' } });
    expect(localStorage.getItem('flussio_company_id')).toBe('2');
    expect(localStorage.getItem('flussio_role')).toBe('editor');
    expect(document.querySelector('.active-company-label')?.textContent).toBe('Famiglia');
  });

  it('hides the company selector when only one context is available', () => {
    localStorage.setItem('flussio_companies', JSON.stringify([{ id: 1, name: 'Windome', role: 'admin' }]));
    renderApp();
    expect(screen.queryByLabelText('Azienda')).toBeNull();
  });

  it('ignores a stale branding response after switching company', async () => {
    const firstBranding = deferred();
    api.getBranding
      .mockReset()
      .mockReturnValueOnce(firstBranding.promise)
      .mockResolvedValueOnce({ has_logo: false, icons: { updated_at: 'new-brand', variants: {} } });

    renderApp();
    fireEvent.change(screen.getAllByLabelText('Azienda')[0], { target: { value: '2' } });

    await waitFor(() => {
      const manifest = document.head.querySelector('link[data-branding-icon="manifest"]');
      expect(manifest?.getAttribute('href')).toContain('company_id=2');
      expect(manifest?.getAttribute('href')).toContain('new-brand');
    });

    firstBranding.resolve({ has_logo: false, icons: { updated_at: 'old-brand', variants: {} } });
    await Promise.resolve();

    const manifest = document.head.querySelector('link[data-branding-icon="manifest"]');
    expect(manifest?.getAttribute('href')).toContain('company_id=2');
    expect(manifest?.getAttribute('href')).not.toContain('old-brand');
  });
});

it('preserves a draft on an unchanged refresh and clears it on a changed module version', async () => {
  renderApp(); const input=await screen.findByLabelText('Page draft');
  fireEvent.change(input,{target:{value:'Company-specific draft'}});
  fireEvent.focus(window); await waitFor(()=>expect(api.getCurrentCapabilities).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Page draft').value).toBe('Company-specific draft');
  api.getCurrentCapabilities.mockResolvedValueOnce(moduleProfile({version:'1',jobs:'read_only'}));
  fireEvent.focus(window); await waitFor(()=>expect(screen.getByLabelText('Page draft').value).toBe(''));
});
it('unmounts previous company content while awaiting the new profile and offers retry on failure', async () => {
  renderApp(); await screen.findByText('Dashboard content');
  api.getCurrentCapabilities.mockRejectedValueOnce(new Error('offline'));
  fireEvent.change(screen.getAllByLabelText('Azienda')[0],{target:{value:'2'}});
  expect(screen.queryByText('Dashboard content')).toBeNull();
  const error=await screen.findByRole('alert'); expect(error.textContent).toContain('modules.ui.loadError');
  api.getCurrentCapabilities.mockResolvedValueOnce(moduleProfile({company:2,role:'editor'}));
  fireEvent.click(screen.getByText('buttons.retry')); await screen.findByText('Dashboard content');
  expect(localStorage.getItem('flussio_role')).toBe('editor');
});

it('adds a newly created company to the selector without signing out or switching the active company', async () => {
  const original = { id: 1, name: 'Windome' };
  const created = { id: 3, name: 'TEST COLLAUDO' };
  localStorage.setItem('flussio_companies', JSON.stringify([{ ...original, role: 'super_admin' }]));
  vi.spyOn(api, 'getCompanies').mockResolvedValueOnce([original]).mockResolvedValue([original, created]);
  vi.spyOn(api, 'createCompany').mockResolvedValue({ company: created, seeded: true });
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>);
  await screen.findByText('Windome', { selector: 'strong' });
  expect(screen.queryByLabelText('Azienda')).toBeNull();
  const token = localStorage.getItem('flussio_token');
  const profileCalls = api.getCurrentCapabilities.mock.calls.length;
  fireEvent.change(screen.getByLabelText('pages.settings.companyName'), { target: { value: 'TEST COLLAUDO' } });
  fireEvent.click(screen.getByRole('button', { name: 'pages.settings.createCompany' }));
  const selector = await screen.findByLabelText('Azienda');
  expect(within(selector).getByRole('option', { name: 'TEST COLLAUDO' }).value).toBe('3');
  expect(selector.value).toBe('1');
  expect(localStorage.getItem('flussio_company_id')).toBe('1');
  expect(localStorage.getItem('flussio_token')).toBe(token);
  expect(api.getCurrentCapabilities).toHaveBeenCalledTimes(profileCalls);
  expect(await screen.findByText('pages.settings.companyCreated')).toBeTruthy();
  expect(api.createCompany).toHaveBeenCalledWith({ name: 'TEST COLLAUDO', seed_defaults: true });
  expect(JSON.parse(localStorage.getItem('flussio_companies')).find(company => company.id === 3).role).toBe('super_admin');
  fireEvent.change(selector, { target: { value: '3' } });
  await screen.findByText('Dashboard content');
  expect(localStorage.getItem('flussio_company_id')).toBe('3');
  expect(document.querySelector('.active-company-label').textContent).toBe('TEST COLLAUDO');
});

it('updates desktop and mobile selectors without remounting the current page or losing a draft', async () => {
  renderApp();
  const input = await screen.findByLabelText('Page draft');
  fireEvent.change(input, { target: { value: 'Unsaved text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apri menu' }));
  const profileCalls = api.getCurrentCapabilities.mock.calls.length;
  act(() => writeCompanies([
    { id: 1, name: 'Windome', role: 'admin' }, { id: 3, name: 'New company', role: 'super_admin' },
  ]));
  const selectors = screen.getAllByLabelText('Azienda');
  expect(selectors).toHaveLength(2);
  for (const selector of selectors) {
    expect(within(selector).getByRole('option', { name: 'New company' })).toBeTruthy();
    expect(within(selector).queryByRole('option', { name: 'Famiglia' })).toBeNull();
    expect(selector.value).toBe('1');
  }
  expect(screen.getByLabelText('Page draft')).toBe(input);
  expect(input.value).toBe('Unsaved text');
  expect(api.getCurrentCapabilities).toHaveBeenCalledTimes(profileCalls);
});

it('updates the selector when the cached list changes in another tab', async () => {
  renderApp();
  await screen.findByText('Dashboard content');
  localStorage.setItem('flussio_companies', JSON.stringify([
    { id: 1, name: 'Windome', role: 'admin' }, { id: 3, name: 'Other tab company', role: 'super_admin' },
  ]));
  fireEvent(window, new StorageEvent('storage', { key: 'flussio_companies' }));
  expect(within(screen.getByLabelText('Azienda')).getByRole('option', { name: 'Other tab company' })).toBeTruthy();
});

it('removes a deleted active company and selects an available company', async () => {
  vi.spyOn(api, 'getCompanies').mockResolvedValueOnce([{ id: 1, name: 'Windome' }, { id: 2, name: 'Famiglia' }]).mockResolvedValue([{ id: 2, name: 'Famiglia' }]);
  vi.spyOn(api, 'deleteCompany').mockResolvedValue(null);
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>);
  const companyRow = (await screen.findByText('Windome', { selector: 'strong' })).closest('li');
  fireEvent.click(within(companyRow).getByRole('button', { name: 'buttons.delete' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('adminUx.typeCompanyName'), { target: { value: 'Windome' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'buttons.delete' }));
  await waitFor(() => expect(localStorage.getItem('flussio_company_id')).toBe('2'));
  await waitFor(() => expect(document.querySelector('.active-company-label')?.textContent).toBe('Famiglia'));
  expect(screen.queryByLabelText('Azienda')).toBeNull();
  expect(JSON.parse(localStorage.getItem('flussio_companies')).map(company => company.id)).toEqual([2]);
});
