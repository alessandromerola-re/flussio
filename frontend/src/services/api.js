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

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed');
    error.code = data.error_code;
    throw error;
  }
  return data;
};

export const api = {
  login: (payload) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  getAccounts: () => request('/api/accounts'),
  createAccount: (payload) => request('/api/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateAccount: (id, payload) => request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (id) => request(`/api/accounts/${id}`, { method: 'DELETE' }),
  getCategories: (direction) =>
    request(direction ? `/api/categories?direction=${direction}` : '/api/categories'),
  createCategory: (payload) => request('/api/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id, payload) => request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),
  getContacts: (search) =>
    request(search ? `/api/contacts?search=${encodeURIComponent(search)}` : '/api/contacts'),
  createContact: (payload) => request('/api/contacts', { method: 'POST', body: JSON.stringify(payload) }),
  updateContact: (id, payload) => request(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteContact: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
  getProperties: () => request('/api/properties'),
  createProperty: (payload) => request('/api/properties', { method: 'POST', body: JSON.stringify(payload) }),
  updateProperty: (id, payload) => request(`/api/properties/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProperty: (id) => request(`/api/properties/${id}`, { method: 'DELETE' }),
  getTransactions: (limit = 30) => request(`/api/transactions?limit=${limit}`),
  createTransaction: (payload) => request('/api/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  getAttachments: (transactionId) => request(`/api/attachments/${transactionId}`),
  getSummary: (period) => request(`/api/dashboard/summary?period=${period}`),
  getCashflow: (period) => request(`/api/dashboard/cashflow?period=${period}`),
  getTopCategories: (period, direction) =>
    request(`/api/dashboard/top-categories?period=${period}&direction=${direction}`),
};
