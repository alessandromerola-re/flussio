import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';

const initialAccount = { name: '', type: 'cash', balance: 0, is_active: true };
const initialCategory = {
  name: '',
  direction: 'income',
  parent_id: '',
  color: '#2ecc71',
  is_active: true,
};
const initialContact = {
  name: '',
  email: '',
  phone: '',
  default_category_id: '',
  is_active: true,
};
const initialProperty = { name: '', notes: '', contact_id: '', is_active: true };

const RegistryPage = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [accountForm, setAccountForm] = useState(initialAccount);
  const [categoryForm, setCategoryForm] = useState(initialCategory);
  const [contactForm, setContactForm] = useState(initialContact);
  const [propertyForm, setPropertyForm] = useState(initialProperty);
  const [editingId, setEditingId] = useState(null);
  const [loadError, setLoadError] = useState('');

  const loadData = async () => {
    setLoadError('');
    const results = await Promise.allSettled([
      api.getAccounts(),
      api.getCategories(),
      api.getContacts(),
      api.getProperties(),
    ]);
    const [accountsResult, categoriesResult, contactsResult, propertiesResult] = results;

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

    if (results.every((result) => result.status === 'rejected')) {
      setLoadError(t('errors.SERVER_ERROR'));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const groupedCategories = useMemo(() => {
    const parents = categories.filter((cat) => !cat.parent_id);
    const children = categories.filter((cat) => cat.parent_id);
    return parents.map((parent) => ({
      ...parent,
      children: children.filter((child) => child.parent_id === parent.id),
    }));
  }, [categories]);

  const resetForms = () => {
    setAccountForm(initialAccount);
    setCategoryForm(initialCategory);
    setContactForm(initialContact);
    setPropertyForm(initialProperty);
    setEditingId(null);
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();
    if (editingId) {
      await api.updateAccount(editingId, accountForm);
    } else {
      await api.createAccount(accountForm);
    }
    resetForms();
    setAccounts(await api.getAccounts());
  };

  const handleCategorySubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...categoryForm,
      parent_id: categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
    };
    if (editingId) {
      await api.updateCategory(editingId, payload);
    } else {
      await api.createCategory(payload);
    }
    resetForms();
    setCategories(await api.getCategories());
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...contactForm,
      default_category_id: contactForm.default_category_id
        ? Number(contactForm.default_category_id)
        : null,
    };
    if (editingId) {
      await api.updateContact(editingId, payload);
    } else {
      await api.createContact(payload);
    }
    resetForms();
    setContacts(await api.getContacts());
  };

  const handlePropertySubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...propertyForm,
      contact_id: propertyForm.contact_id ? Number(propertyForm.contact_id) : null,
    };
    if (editingId) {
      await api.updateProperty(editingId, payload);
    } else {
      await api.createProperty(payload);
    }
    resetForms();
    setProperties(await api.getProperties());
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(t('modals.confirmDelete'))) {
      return;
    }
    const actions = {
      accounts: () => api.deleteAccount(id),
      categories: () => api.deleteCategory(id),
      contacts: () => api.deleteContact(id),
      properties: () => api.deleteProperty(id),
    };
    await actions[type]();
    resetForms();
    loadData();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('pages.registry.title')}</h1>
      </div>
      {loadError && <div className="error">{loadError}</div>}
      <div className="tabs">
        <button type="button" className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>
          {t('pages.registry.accounts')}
        </button>
        <button type="button" className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>
          {t('pages.registry.categories')}
        </button>
        <button type="button" className={tab === 'contacts' ? 'active' : ''} onClick={() => setTab('contacts')}>
          {t('pages.registry.contacts')}
        </button>
        <button type="button" className={tab === 'properties' ? 'active' : ''} onClick={() => setTab('properties')}>
          {t('pages.registry.properties')}
        </button>
      </div>

      {tab === 'accounts' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleAccountSubmit}>
            <h2>{t('pages.registry.accounts')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={accountForm.name}
                onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.type')}
              <select
                value={accountForm.type}
                onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value })}
              >
                <option value="cash">{t('labels.cash')}</option>
                <option value="bank">{t('labels.bank')}</option>
                <option value="card">{t('labels.card')}</option>
              </select>
            </label>
            <label>
              {t('forms.balance')}
              <input
                type="number"
                step="0.01"
                value={accountForm.balance}
                onChange={(event) => setAccountForm({ ...accountForm, balance: event.target.value })}
              />
            </label>
            <button type="submit">{t('buttons.save')}</button>
          </form>
          <div className="card">
            <ul className="list">
              {accounts.map((account) => (
                <li key={account.id} className="list-item-row">
                  <div>
                    <strong>{account.name}</strong>
                    <div className="muted">{t(`labels.${account.type}`)}</div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setAccountForm(account);
                        setEditingId(account.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete('accounts', account.id)}>
                      {t('buttons.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleCategorySubmit}>
            <h2>{t('pages.registry.categories')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={categoryForm.name}
                onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.direction')}
              <select
                value={categoryForm.direction}
                onChange={(event) =>
                  setCategoryForm({ ...categoryForm, direction: event.target.value, parent_id: '' })
                }
              >
                <option value="income">{t('pages.movements.income')}</option>
                <option value="expense">{t('pages.movements.expense')}</option>
              </select>
            </label>
            <label>
              {t('forms.parentCategory')}
              <select
                value={categoryForm.parent_id}
                onChange={(event) => setCategoryForm({ ...categoryForm, parent_id: event.target.value })}
              >
                <option value="">{t('common.none')}</option>
                {categories
                  .filter((cat) => !cat.parent_id && cat.direction === categoryForm.direction)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('forms.color')}
              <input
                type="color"
                value={categoryForm.color || '#2ecc71'}
                onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
              />
            </label>
            <button type="submit">{t('buttons.save')}</button>
          </form>
          <div className="card">
            <ul className="list">
              {groupedCategories.map((category) => (
                <li key={category.id}>
                  <div className="list-item-row">
                    <div className="category-label">
                      <span className="dot" style={{ backgroundColor: category.color || '#ccc' }} />
                      <strong>{category.name}</strong>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setCategoryForm({
                            name: category.name,
                            direction: category.direction,
                            parent_id: category.parent_id || '',
                            color: category.color || '#2ecc71',
                            is_active: category.is_active,
                          });
                          setEditingId(category.id);
                        }}
                      >
                        {t('buttons.edit')}
                      </button>
                      <button type="button" className="danger" onClick={() => handleDelete('categories', category.id)}>
                        {t('buttons.delete')}
                      </button>
                    </div>
                  </div>
                  {category.children.length > 0 && (
                    <ul className="sub-list">
                      {category.children.map((child) => (
                        <li key={child.id} className="list-item-row">
                          <div className="category-label indent">
                            <span className="dot" style={{ backgroundColor: child.color || '#ccc' }} />
                            {child.name}
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                setCategoryForm({
                                  name: child.name,
                                  direction: child.direction,
                                  parent_id: child.parent_id || '',
                                  color: child.color || '#2ecc71',
                                  is_active: child.is_active,
                                });
                                setEditingId(child.id);
                              }}
                            >
                              {t('buttons.edit')}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete('categories', child.id)}
                            >
                              {t('buttons.delete')}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="grid-two">
          <form className="card" onSubmit={handleContactSubmit}>
            <h2>{t('pages.registry.contacts')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={contactForm.name}
                onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.email')}
              <input
                type="email"
                value={contactForm.email}
                onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })}
              />
            </label>
            <label>
              {t('forms.phone')}
              <input
                type="text"
                value={contactForm.phone}
                onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })}
              />
            </label>
            <label>
              {t('forms.defaultCategory')}
              <select
                value={contactForm.default_category_id}
                onChange={(event) =>
                  setContactForm({ ...contactForm, default_category_id: event.target.value })
                }
              >
                <option value="">{t('common.none')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.direction})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{t('buttons.save')}</button>
          </form>
          <div className="card">
            <ul className="list">
              {contacts.map((contact) => (
                <li key={contact.id} className="list-item-row">
                  <div>
                    <strong>{contact.name}</strong>
                    <div className="muted">{contact.email || t('common.none')}</div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setContactForm({
                          name: contact.name,
                          email: contact.email || '',
                          phone: contact.phone || '',
                          default_category_id: contact.default_category_id || '',
                          is_active: contact.is_active,
                        });
                        setEditingId(contact.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete('contacts', contact.id)}>
                      {t('buttons.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'properties' && (
        <div className="grid-two">
          <form className="card" onSubmit={handlePropertySubmit}>
            <h2>{t('pages.registry.properties')}</h2>
            <label>
              {t('forms.name')}
              <input
                type="text"
                value={propertyForm.name}
                onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              {t('forms.notes')}
              <input
                type="text"
                value={propertyForm.notes}
                onChange={(event) => setPropertyForm({ ...propertyForm, notes: event.target.value })}
              />
            </label>
            <label>
              {t('forms.referenceContact')}
              <select
                value={propertyForm.contact_id}
                onChange={(event) => setPropertyForm({ ...propertyForm, contact_id: event.target.value })}
              >
                <option value="">{t('common.none')}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{t('buttons.save')}</button>
          </form>
          <div className="card">
            <ul className="list">
              {properties.map((property) => (
                <li key={property.id} className="list-item-row">
                  <div>
                    <strong>{property.name}</strong>
                    <div className="muted">{property.notes || t('common.none')}</div>
                    <div className="muted">
                      {t('forms.referenceContact')}: {property.contact_name || t('common.none')}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPropertyForm({
                          name: property.name,
                          notes: property.notes || '',
                          contact_id: property.contact_id || '',
                          is_active: property.is_active,
                        });
                        setEditingId(property.id);
                      }}
                    >
                      {t('buttons.edit')}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete('properties', property.id)}>
                      {t('buttons.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistryPage;
