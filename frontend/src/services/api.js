const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const getToken = () => localStorage.getItem('flussio_token');

export const setToken = (token) => {
  localStorage.setItem('flussio_token', token);
};

export const clearToken = () => {
  localStorage.removeItem('flussio_token');
};

const request = async (path, options = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/login';
    const error = new Error('Unauthorized');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || response.statusText || 'Request failed');
    error.code = data?.error_code;
    throw error;
  }

  return data;
};

export const api = {
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getAccounts: () => request('/accounts'),
  createAccount: (payload) => request('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateAccount: (id, payload) => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),
  getCategories: (direction) =>
    request(direction ? `/categories?direction=${direction}` : '/categories'),
  createCategory: (payload) => request('/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id, payload) =>
    request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  getContacts: (search) =>
    request(search ? `/contacts?search=${encodeURIComponent(search)}` : '/contacts'),
  createContact: (payload) => request('/contacts', { method: 'POST', body: JSON.stringify(payload) }),
  updateContact: (id, payload) => request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  getProperties: () => request('/properties'),
  createProperty: (payload) => request('/properties', { method: 'POST', body: JSON.stringify(payload) }),
  updateProperty: (id, payload) => request(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: 'DELETE' }),
  getTransactions: (limit = 30) => request(`/transactions?limit=${limit}`),
  createTransaction: (payload) => request('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  getAttachments: (transactionId) => request(`/attachments/${transactionId}`),
  getSummary: (period) => request(`/dashboard/summary?period=${period}`),
  getCashflow: (period) => request(`/dashboard/cashflow?period=${period}`),
  getTopCategories: (period, direction) =>
    request(`/dashboard/top-categories?period=${period}&direction=${direction}`),
};
