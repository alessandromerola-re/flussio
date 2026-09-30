import { render } from './helpers/moduleRender.jsx';
import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MovementsPage from '../src/pages/MovementsPage.jsx';
import { api } from '../src/services/api.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options = {}) => ({
      'pages.movements.title': 'Prima nota',
      'pages.movements.new': 'Nuovo movimento',
      'pages.movements.latest': 'Ultimi movimenti',
      'pages.movements.details': 'Dettaglio movimento',
      'pages.movements.date': 'Data',
      'pages.movements.type': 'Tipo',
      'pages.movements.amount': 'Importo',
      'pages.movements.description': 'Descrizione',
      'pages.movements.account': 'Conto',
      'pages.movements.category': 'Categoria',
      'pages.movements.contact': 'Contatto',
      'pages.movements.property': 'Immobile',
      'pages.movements.job': 'Commessa',
      'pages.movements.attachments': 'Allegati',
      'pages.movements.filters': 'Filtri',
      'pages.movements.search': 'Cerca movimenti',
      'pages.movements.searchPlaceholder': 'Cerca movimenti…',
      'pages.movements.results': `${options.count} movimenti`,
      'pages.movements.open': 'Apri',
      'pages.movements.links': 'Collegamenti',
      'pages.movements.income': 'Entrata',
      'pages.movements.expense': 'Uscita',
      'pages.movements.transfer': 'Giroconto',
      'pages.movements.recurrence': 'Ricorrenza',
      'common.none': 'Nessuno',
      'common.all': 'Tutti',
      'common.loading': 'Caricamento…',
      'buttons.close': 'Chiudi',
      'buttons.edit': 'Modifica',
      'buttons.delete': 'Elimina',
      'buttons.upload': 'Carica',
      'buttons.download': 'Scarica',
    }[key] || key),
  }),
}));

vi.mock('../src/services/api.js', () => ({
  api: {
    getTransactions: vi.fn(),
    getAccounts: vi.fn(),
    getCategories: vi.fn(),
    getContacts: vi.fn(),
    getProperties: vi.fn(),
    getJobs: vi.fn(),
    getAttachments: vi.fn(),
  },
}));

vi.mock('../src/utils/permissions.js', () => ({ canPermission: () => true }));

const movement = {
  id: 10,
  date: '2026-08-30',
  type: 'expense',
  amount_total: -450,
  description: 'Spese condominiali',
  category_name: 'Casa',
  contact_name: 'Amministratore Rossi',
  property_id: 1,
  property_name: 'Immobile Centro',
  job_name: null,
  attachment_count: 1,
  accounts: [{ account_id: 1, account_name: 'Banca', direction: 'out', amount: 450 }],
};

const renderPage = () => render(
  <MemoryRouter initialEntries={['/movements']}>
    <MovementsPage />
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  api.getTransactions.mockResolvedValue({
    data: [movement],
    headers: new Headers({ 'X-Has-More': 'false', 'X-Total-Count': '1' }),
  });
  api.getAccounts.mockResolvedValue([{ id: 1, name: 'Banca' }]);
  api.getCategories.mockResolvedValue([{ id: 1, name: 'Casa', direction: 'expense' }]);
  api.getContacts.mockResolvedValue([{ id: 1, name: 'Amministratore Rossi' }]);
  api.getProperties.mockResolvedValue([{ id: 1, name: 'Immobile Centro' }]);
  api.getJobs.mockResolvedValue([]);
  api.getAttachments.mockResolvedValue([]);
});

describe('MovementsPage responsive UX', () => {
  it('renders desktop and mobile movement views with result count and property', async () => {
    renderPage();

    expect(await screen.findByText('1 movimenti')).toBeTruthy();
    expect(document.querySelector('.movements-table')).toBeTruthy();
    expect(document.querySelector('.movement-mobile-card')).toBeTruthy();
    expect(screen.getAllByText('Immobile Centro').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('button a')).toBeNull();
  });

  it('opens one complete detail dialog from the mobile card', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.movement-mobile-card')).toBeTruthy());
    const mobileCard = document.querySelector('.movement-mobile-card');
    fireEvent.click(mobileCard);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Dettaglio movimento')).toBeTruthy();
    expect(within(dialog).getByText('Immobile Centro')).toBeTruthy();
    expect(within(dialog).getByText('Banca')).toBeTruthy();
  });

  it('offers a property field in creation and neutral advanced filters', async () => {
    renderPage();
    await screen.findByText('1 movimenti');

    fireEvent.click(screen.getAllByRole('button', { name: 'Nuovo movimento' })[0]);
    const createDialog = await screen.findByRole('dialog');
    expect(within(createDialog).getByLabelText('Immobile')).toBeTruthy();
    fireEvent.click(within(createDialog).getByLabelText('Chiudi finestra'));

    fireEvent.click(screen.getByRole('button', { name: /^Filtri/ }));
    const propertyFilter = screen.getByLabelText('Immobile');
    expect(within(propertyFilter).getByRole('option', { name: 'Tutti' })).toBeTruthy();
    expect(screen.getByLabelText('Ricorrenza')).toBeTruthy();
    expect(screen.getByLabelText('Allegati')).toBeTruthy();
  });
});

it('preserves recurring execution deep links and exposes their filter chips', async () => {
  render(<MemoryRouter initialEntries={['/movements?transaction_id=10&recurring_template_id=4']}><MovementsPage /></MemoryRouter>);
  await waitFor(() => expect(api.getTransactions).toHaveBeenCalledWith(expect.objectContaining({ transaction_id: '10', recurring_template_id: '4' })));
  expect(screen.getByText(/Dettaglio movimento #10/)).toBeTruthy();
});

it('opens creation from a job with that job already selected', async () => {
  api.getJobs.mockResolvedValue([{ id: 7, title: 'Infissi', code: 'C7' }]);
  render(<MemoryRouter initialEntries={['/movements?job_id=7&new=1']}><MovementsPage /></MemoryRouter>);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByLabelText('Commessa').value).toBe('7'));
  expect(api.getTransactions).toHaveBeenCalledWith(expect.objectContaining({ job_id: '7' }));
});

it('preserves report filters and lets users remove a single detail constraint', async () => {
  render(<MemoryRouter initialEntries={['/movements?cashflow_only=1&description_q=rent&missing_contact=1&category_id=1&include_category_children=1']}><MovementsPage /></MemoryRouter>);
  await waitFor(() => expect(api.getTransactions).toHaveBeenCalledWith(expect.objectContaining({ cashflow_only: '1', description_q: 'rent', missing_contact: '1', category_id: '1', include_category_children: '1' })));
  fireEvent.click(screen.getByRole('button', { name: /reportDetail.missing_contact/ }));
  await waitFor(() => expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ missing_contact: '', cashflow_only: '1', description_q: 'rent', category_id: '1', include_category_children: '1' })));
});

it('opens creation from a property with that property already selected', async () => {
  render(<MemoryRouter initialEntries={['/movements?property_id=1&new=1']}><MovementsPage /></MemoryRouter>);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByLabelText('Immobile').value).toBe('1'));
  expect(api.getTransactions).toHaveBeenCalledWith(expect.objectContaining({ property_id: '1' }));
});

it('blocks revoked module deep links without silently querying unfiltered Base movements', async () => {
  render(<MemoryRouter initialEntries={['/movements?job_id=7&new=1']}><MovementsPage /></MemoryRouter>, {modules:{jobs:'disabled',real_estate:'disabled'}});
  await screen.findByText('errors.MODULE_DISABLED');
  expect(api.getTransactions).not.toHaveBeenCalled(); expect(api.getJobs).not.toHaveBeenCalled(); expect(api.getProperties).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByText('Spese condominiali')).toBeNull();
});
it('edits Base fields without sending or deleting a historic read-only property link', async () => {
  api.updateTransaction=vi.fn().mockResolvedValue({id:10});
  render(<MemoryRouter><MovementsPage /></MemoryRouter>, {modules:{jobs:'disabled',real_estate:'read_only'}});
  await screen.findByText('1 movimenti'); fireEvent.click(screen.getAllByRole('button',{name:/Spese condominiali/})[0]);
  const detail=await screen.findByRole('dialog'); expect(within(detail).queryByRole('button',{name:'Elimina'})).toBeNull();
  fireEvent.click(within(detail).getByRole('button',{name:'Modifica'}));
  const edit=await screen.findByRole('dialog'); expect(within(edit).getByLabelText('Immobile').disabled).toBe(true);
  expect(within(edit).getByLabelText('Immobile').value).toBe('1');
  fireEvent.change(within(edit).getByLabelText('Descrizione'),{target:{value:'Updated Base description'}});
  fireEvent.submit(edit.querySelector('form'));
  await waitFor(()=>expect(api.updateTransaction).toHaveBeenCalledTimes(1));
  const [id,payload]=api.updateTransaction.mock.calls[0]; expect(id).toBe(10); expect(payload.description).toBe('Updated Base description');
  expect(payload).not.toHaveProperty('property_id'); expect(payload).not.toHaveProperty('job_id'); expect(api.getJobs).not.toHaveBeenCalled();
});
