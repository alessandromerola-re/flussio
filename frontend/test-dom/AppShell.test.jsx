import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { api } from '../src/services/api.js';

vi.mock('../src/routes.jsx', () => ({
  default: ({ token }) => [
    { path: '/dashboard', element: token ? <div>Dashboard content</div> : <div>Login content</div> },
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
    expect(screen.getByText('Dashboard content')).toBeTruthy();
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
