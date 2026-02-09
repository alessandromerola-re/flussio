import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  type: 'income',
  amount_total: '',
  description: '',
  account_in: '',
  account_out: '',
  category_id: '',
  contact_id: '',
  property_id: '',
};

const MovementsPage = () => {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState([]);
  const [showContactResults, setShowContactResults] = useState(false);

  const loadData = async () => {
    setLoadError('');
    const results = await Promise.allSettled([
      api.getAccounts(),
      api.getCategories(),
      api.getContacts(),
      api.getProperties(),
      api.getTransactions(),
    ]);
    const [accountsResult, categoriesResult, contactsResult, propertiesResult, movementsResult] =
      results;

    if (accountsResult.status === 'fulfilled') {
      setAccounts(accountsResult.value);
    }
    if (categoriesResult.status === 'fulfilled') {
      setCategories(categoriesResult.value);
    }
    if (contactsResult.status === 'fulfilled') {
      setContacts(contactsResult.value);
    }
    if (propertiesResult.status === 'fulfilled') {
      setProperties(propertiesResult.value);
    }
    if (movementsResult.status === 'fulfilled') {
      setMovements(movementsResult.value);
    }

    if (results.every((result) => result.status === 'rejected')) {
      setLoadError(t('errors.SERVER_ERROR'));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (value) => {
    if (!value) return '';
    const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      const [year, month, day] = isoMatch[1].split('-');
      return `${day}/${month}/${year}`;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('it-IT');
    }
    return value;
  };

  const formatAccounts = (accountsList = []) => {
    const names = accountsList
      .map((account) => account?.account_name)
      .filter(Boolean);
    return names.length ? names.join(' → ') : t('common.none');
  };

  useEffect(() => {
    const loadAttachments = async () => {
      if (!selected) {
        setAttachments([]);
        return;
      }
      const data = await api.getAttachments(selected.id);
      setAttachments(data);
    };
    loadAttachments();
  }, [selected]);

  const movementCategories = useMemo(() => {
    if (form.type === 'income' || form.type === 'expense') {
      return categories.filter((cat) => cat.direction === form.type);
    }
    return [];
  }, [categories, form.type]);

  const groupedCategories = useMemo(() => {
    const parents = movementCategories.filter((cat) => !cat.parent_id);
    const children = movementCategories.filter((cat) => cat.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: children.filter((child) => child.parent_id === parent.id),
    }));
  }, [movementCategories]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleContactSearch = async (value) => {
    setContactSearch(value);
    if (!value) {
      handleChange('contact_id', '');
      setContactResults([]);
      setShowContactResults(false);
      return;
    }
    const results = await api.getContacts(value);
    setContactResults(results);
    setShowContactResults(true);
  };

  const handleSelectContact = (contact) => {
    handleChange('contact_id', contact.id);
    setContactSearch(contact.name);
    setShowContactResults(false);
    if (contact.default_category_id && form.type !== 'transfer') {
      const match = categories.find((cat) => cat.id === contact.default_category_id);
      if (match && match.direction === form.type) {
        handleChange('category_id', contact.default_category_id);
      }
    }
  };

  const validate = () => {
    if (!form.amount_total || Number(form.amount_total) <= 0) {
      return t('errors.VALIDATION_MISSING_AMOUNT');
    }
    if (form.type === 'transfer') {
      if (!form.account_out || !form.account_in) {
        return t('errors.VALIDATION_ACCOUNT_REQUIRED');
      }
      if (form.account_out === form.account_in) {
        return t('errors.VALIDATION_TRANSFER_ACCOUNTS');
      }
    } else if (!form.account_in && !form.account_out) {
      return t('errors.VALIDATION_ACCOUNT_REQUIRED');
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');

    const accountsPayload = [];
    if (form.type === 'transfer') {
      accountsPayload.push({
        account_id: Number(form.account_out),
        direction: 'out',
        amount: Number(form.amount_total),
      });
      accountsPayload.push({
        account_id: Number(form.account_in),
        direction: 'in',
        amount: Number(form.amount_total),
      });
    } else {
      const direction = form.type === 'income' ? 'in' : 'out';
      const accountId = Number(form.account_in || form.account_out);
      accountsPayload.push({
        account_id: accountId,
        direction,
        amount: Number(form.amount_total),
      });
    }

    await api.createTransaction({
      date: form.date,
      type: form.type,
      amount_total: Number(form.amount_total),
      description: form.description,
      category_id: form.category_id ? Number(form.category_id) : null,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      property_id: form.property_id ? Number(form.property_id) : null,
      accounts: accountsPayload,
    });
    setForm(emptyForm);
    setContactSearch('');
    setMovements(await api.getTransactions());
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('modals.confirmDelete'))) {
      return;
    }
    await api.deleteTransaction(id);
    setSelected(null);
    setMovements(await api.getTransactions());
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.movements.title')}</h1>
      </div>
      {loadError && <div className="error">{loadError}</div>}

      <div className="grid-two">
        <form className="card" onSubmit={handleSubmit}>
          <h2>{t('pages.movements.new')}</h2>
          <div className="form-grid">
            <label>
              {t('pages.movements.date')}
              <input
                type="date"
                value={form.date}
                onChange={(event) => handleChange('date', event.target.value)}
                required
              />
            </label>
            <label>
              {t('pages.movements.type')}
              <select
                value={form.type}
                onChange={(event) => handleChange('type', event.target.value)}
              >
                <option value="income">{t('pages.movements.income')}</option>
                <option value="expense">{t('pages.movements.expense')}</option>
                <option value="transfer">{t('pages.movements.transfer')}</option>
              </select>
            </label>
            <label>
              {t('pages.movements.amount')}
              <input
                type="number"
                step="0.01"
                value={form.amount_total}
                onChange={(event) => handleChange('amount_total', event.target.value)}
                required
              />
            </label>
            {form.type === 'transfer' ? (
              <>
                <label>
                  {t('pages.movements.accountFrom')}
                  <select
                    value={form.account_out}
                    onChange={(event) => handleChange('account_out', event.target.value)}
                    required
                  >
                    <option value="">{t('common.none')}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('pages.movements.accountTo')}
                  <select
                    value={form.account_in}
                    onChange={(event) => handleChange('account_in', event.target.value)}
                    required
                  >
                    <option value="">{t('common.none')}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label>
                {t('pages.movements.account')}
                <select
                  value={form.account_in || form.account_out}
                  onChange={(event) => handleChange('account_in', event.target.value)}
                  required
                >
                  <option value="">{t('common.none')}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="relative">
              {t('pages.movements.contact')}
              <input
                type="text"
                value={contactSearch}
                onChange={(event) => handleContactSearch(event.target.value)}
                onFocus={() => contactSearch && setShowContactResults(true)}
                placeholder={t('placeholders.searchContacts')}
              />
              {showContactResults && contactResults.length > 0 && (
                <ul className="dropdown">
                  {contactResults.map((contact) => (
                    <li key={contact.id}>
                      <button type="button" onClick={() => handleSelectContact(contact)}>
                        {contact.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            {form.type !== 'transfer' && (
              <label>
                {t('pages.movements.category')}
                <select
                  value={form.category_id}
                  onChange={(event) => handleChange('category_id', event.target.value)}
                >
                  <option value="">{t('common.none')}</option>
                  {groupedCategories.map((category) => (
                    <optgroup key={category.id} label={category.name}>
                      <option value={category.id}>{category.name}</option>
                      {category.children.map((child) => (
                        <option key={child.id} value={child.id}>
                          └ {child.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t('pages.movements.property')}
              <select
                value={form.property_id}
                onChange={(event) => handleChange('property_id', event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              {t('pages.movements.description')}
              <input
                type="text"
                value={form.description}
                onChange={(event) => handleChange('description', event.target.value)}
                placeholder={t('placeholders.description')}
              />
            </label>
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit">{t('buttons.save')}</button>
        </form>

        <div className="card">
          <h2>{t('pages.movements.latest')}</h2>
          <div className="list">
            {movements.map((movement) => (
              <button
                key={movement.id}
                type="button"
                className="list-item"
                onClick={() => setSelected(movement)}
              >
                <div>
                  <strong>{movement.description || movement.type}</strong>
                  <div className="muted">{formatDate(movement.date)}</div>
                  <div className="muted">
                    {t('pages.movements.account')}: {formatAccounts(movement.accounts)}
                  </div>
                  <div className="muted">
                    {t('pages.movements.category')}: {movement.category_name || t('common.none')}
                  </div>
                  <div className="muted">
                    {t('pages.movements.contact')}: {movement.contact_name || t('common.none')}
                  </div>
                </div>
                <div
                  className={
                    movement.type === 'income'
                      ? 'amount positive'
                      : movement.type === 'expense'
                      ? 'amount negative'
                      : 'amount'
                  }
                >
                  € {Number(movement.amount_total).toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="modal">
          <div className="modal-content">
            <h2>{t('pages.movements.details')}</h2>
            <p>
              <strong>{t('pages.movements.date')}:</strong> {formatDate(selected.date)}
            </p>
            <p>
              <strong>{t('pages.movements.type')}:</strong> {t(`pages.movements.${selected.type}`)}
            </p>
            <p>
              <strong>{t('pages.movements.amount')}:</strong> € {Number(selected.amount_total).toFixed(2)}
            </p>
            <p>
              <strong>{t('pages.movements.category')}:</strong> {selected.category_name || t('common.none')}
            </p>
            <p>
              <strong>{t('pages.movements.contact')}:</strong> {selected.contact_name || t('common.none')}
            </p>
            <p>
              <strong>{t('pages.movements.property')}:</strong> {selected.property_name || t('common.none')}
            </p>
            <p>
              <strong>{t('pages.movements.description')}:</strong> {selected.description || t('common.none')}
            </p>
            <div>
              <strong>{t('pages.movements.attachments')}:</strong>
              <ul>
                {attachments.length === 0 && (
                  <li className="muted">{t('pages.movements.noAttachments')}</li>
                )}
                {attachments.map((item) => (
                  <li key={item.id}>{item.file_name}</li>
                ))}
              </ul>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setSelected(null)}>
                {t('buttons.close')}
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(selected.id)}>
                {t('buttons.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovementsPage;
