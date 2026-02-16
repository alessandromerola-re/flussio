const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const getToken = () => localStorage.getItem('flussio_token');

export const setToken = (token) => {
  localStorage.setItem('flussio_token', token);
};

export const clearToken = () => {
  localStorage.removeItem('flussio_token');
};

const toQueryString = (params = {}) => {
  const entries = Object.entries(params).filter(([, value]) => value != null && value !== '');
  if (entries.length === 0) {
    return '';
  }

  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')}`;
};

const request = async (path, options = {}) => {
  const { responseType, includeHeaders, ...fetchOptions } = options;
  const headers = { ...(fetchOptions.headers || {}) };
  const hasBody = fetchOptions.body !== undefined;
  const isFormData = hasBody && fetchOptions.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/login';
    const error = new Error('Unauthorized');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  if (response.status === 204) return null;

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }
    const blob = await response.blob();
    return includeHeaders ? { blob, headers: response.headers } : blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const error = new Error(response.statusText || 'Request failed');
      error.code = 'SERVER_ERROR';
      throw error;
    }

    const blob = await response.blob();
    if (includeHeaders === true) {
      return { blob, headers: response.headers };
    }
    return blob;
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
  getTransactions: (input = 30) => {
    if (typeof input === 'number') {
      return request(`/transactions?limit=${input}`);
    }

    const queryString = toQueryString(input);
    return request(`/transactions${queryString}`);
  },
  exportTransactions: (filters = {}) => {
    const queryString = toQueryString(filters);
    return request(`/transactions/export${queryString}`, { responseType: 'blob', includeHeaders: true });
  },
  createTransaction: (payload) => request('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  updateTransaction: (id, payload) =>
    request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  getAttachments: (transactionId) => request(`/attachments/${transactionId}`),
  uploadAttachment: (transactionId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/attachments/${transactionId}`, { method: 'POST', body: formData });
  },
  downloadAttachment: (attachmentId) => request(`/attachments/file/${attachmentId}`, { responseType: 'blob' }),
  deleteAttachment: (attachmentId) => request(`/attachments/${attachmentId}`, { method: 'DELETE' }),
  getSummary: (period) => request(`/dashboard/summary?period=${period}`),
  getCashflow: (period) => request(`/dashboard/cashflow?period=${period}`),
  getTopCategories: (period, direction) =>
    request(`/dashboard/top-categories?period=${period}&direction=${direction}`),
};
