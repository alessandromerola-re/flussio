import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegistryPage from '../src/pages/RegistryPage.jsx';
import { api } from '../src/services/api.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options = {}) => ({
      'pages.registry.title': 'Anagrafiche',
      'pages.registry.accounts': 'Conti',
      'pages.registry.categories': 'Categorie',
      'pages.registry.contacts': 'Contatti',
      'pages.registry.jobs': 'Commesse',
      'pages.registry.properties': 'Immobili',
      'pages.registry.selectRegistry': 'Seleziona anagrafica',
      'pages.registry.tools': 'Strumenti anagrafica',
      'pages.registry.status': 'Stato',
      'pages.registry.sort': 'Ordina',
      'pages.registry.sortNameAsc': 'Nome A–Z',
      'pages.registry.sortNameDesc': 'Nome Z–A',
      'pages.registry.sortStatus': 'Attivi prima',
      'pages.registry.searchPlaceholder': `Cerca tra ${options.entity}…`,
      'pages.registry.results': `di ${options.total} elementi`,
      'pages.registry.loading': `Caricamento ${options.entity}…`,
      'pages.registry.loadError': 'Impossibile caricare',
      'pages.registry.noResults': 'Nessun risultato',
      'pages.registry.emptyFiltered': 'Modifica la ricerca',
      'pages.registry.emptyTitle': `Nessun elemento in ${options.entity}`,
      'pages.registry.emptyDescription': 'Aggiungi il primo elemento',
      'pages.registry.createFirst': 'Crea il primo elemento',
      'pages.movements.income': 'Entrata',
      'pages.movements.expense': 'Uscita',
      'labels.active': 'Attivo',
      'labels.inactive': 'Inattivo',
      'labels.jobOpen': 'Attiva',
      'labels.jobClosed': 'Chiusa',
      'labels.bank': 'Banca',
      'forms.openingBalance': 'Saldo iniziale',
      'forms.currentBalance': 'Saldo attuale',
      'forms.search': 'Cerca',
      'forms.propertyCode': 'Codice immobile',
      'buttons.new': 'Nuovo',
      'buttons.edit': 'Modifica',
      'buttons.delete': 'Elimina',
      'buttons.details': 'Dettagli',
      'buttons.retry': 'Riprova',
      'buttons.reset': 'Reset',
      'common.all': 'Tutti',
      'common.none': 'Nessuno',
    }[key] || key),
  }),
}));

vi.mock('../src/services/api.js', () => ({
  api: {
    getAccounts: vi.fn(),
    getCategories: vi.fn(),
    getContacts: vi.fn(),
    getProperties: vi.fn(),
    getJobs: vi.fn(),
  },
}));

vi.mock('../src/utils/permissions.js', () => ({ canPermission: () => true }));

const renderPage = () => render(<MemoryRouter><RegistryPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getAccounts.mockResolvedValue([
    { id: 1, name: 'Banca aziendale', type: 'bank', opening_balance: 100, balance: 250, is_active: true },
    { id: 2, name: 'Vecchia cassa', type: 'cash', opening_balance: 0, balance: 0, is_active: false },
  ]);
  api.getCategories.mockResolvedValue([
    { id: 3, name: 'Manutenzione', direction: 'expense', parent_id: 2, is_active: true },
    { id: 1, name: 'Immobili', direction: 'expense', parent_id: null, is_active: true },
    { id: 2, name: 'Costi', direction: 'expense', parent_id: 1, is_active: true },
  ]);
  api.getContacts.mockResolvedValue([]);
  api.getProperties.mockResolvedValue([{ id: 5, name: 'Appartamento Centro', external_id: 'IMM-000005', is_active: true }]);
  api.getJobs.mockResolvedValue([]);
});

describe('RegistryPage scalable responsive UX', () => {
  it('loads only the active registry and exposes a mobile selector', async () => {
    renderPage();
    await waitFor(() => expect(api.getJobs).toHaveBeenCalledTimes(1));
    expect(api.getAccounts).not.toHaveBeenCalled();
    expect(api.getCategories).not.toHaveBeenCalled();

    const mobileSelector = screen.getByRole('combobox', { name: 'Seleziona anagrafica' });
    fireEvent.change(mobileSelector, { target: { value: 'properties' } });
    expect(await screen.findByText('Appartamento Centro')).toBeTruthy();
    expect(screen.getByText(/IMM-000005/)).toBeTruthy();
    expect(api.getProperties).toHaveBeenCalledTimes(1);
  });

  it('filters by status, searches locally and reports the visible count', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Conti' }));
    expect(await screen.findByText('Banca aziendale')).toBeTruthy();

    const toolbar = screen.getByRole('region', { name: 'Strumenti anagrafica' });
    fireEvent.change(within(toolbar).getByLabelText('Stato'), { target: { value: 'inactive' } });
    expect(screen.queryByText('Banca aziendale')).toBeNull();
    expect(screen.getByText('Vecchia cassa')).toBeTruthy();
    expect(within(toolbar).getByText('1')).toBeTruthy();

    fireEvent.change(within(toolbar).getByLabelText('Cerca'), { target: { value: 'inesistente' } });
    expect(screen.getByText('Nessun risultato')).toBeTruthy();
  });

  it('renders every category hierarchy level with its complete path', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Categorie' }));
    expect(await screen.findByText('Manutenzione')).toBeTruthy();
    expect(screen.getByText('Immobili / Costi / Manutenzione')).toBeTruthy();
    expect(document.querySelector('[data-depth="2"]')).toBeTruthy();
  });

  it('shows a stable error state and retries only on request', async () => {
    api.getJobs.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByText('Impossibile caricare')).toBeTruthy();
    expect(api.getJobs).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect(api.getJobs).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Nessun elemento in Commesse')).toBeTruthy();
  });
});
