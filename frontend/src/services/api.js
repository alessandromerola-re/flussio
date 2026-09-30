import { clearSession, isPersistentSession, readSession, writeSession, writeSessionRole } from '../utils/authStorage.js';

const API_BASE = import.meta.env?.VITE_API_BASE || '/api';
let refreshPromise = null;
let contextRevision = 0;
export const getContextRevision = () => contextRevision;
const contextChanged = () => {
  contextRevision += 1;
  if (typeof window !== 'undefined') window.dispatchEvent?.(new Event('flussio-context-change'));
};
const notifyModuleDenial = code => {
  if (['MODULE_DISABLED', 'MODULE_READ_ONLY', 'MODULE_UNAVAILABLE', 'MODULE_DEPENDENCY_MISSING'].includes(code) && typeof window !== 'undefined') {
    window.dispatchEvent?.(new Event('flussio-module-access-denied'));
  }
};
const assertContext = context => {
  if (context.revision !== contextRevision || context.company !== getActiveCompanyId()) {
    throw Object.assign(new Error('Company or session changed'), { code: 'CONTEXT_CHANGED' });
  }
};
if (typeof window !== 'undefined') window.addEventListener?.('storage', event => {
  if (!event.key || ['flussio_company_id', 'flussio_token', 'flussio_role'].includes(event.key)) contextChanged();
});

export const getToken = () => readSession().token;
export const getRole = () => readSession().role;
export const getActiveCompanyId = () => localStorage.getItem('flussio_company_id');

export const setActiveCompanyId = (id) => {
  const previous = getActiveCompanyId();
  if (id == null || id === '') {
    localStorage.removeItem('flussio_company_id');
    if (previous != null) contextChanged();
    return;
  }
  localStorage.setItem('flussio_company_id', String(id));
  if (String(previous) !== String(id)) contextChanged();
};


const parseJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const getIsSuperAdmin = () => {
  const payload = parseJwtPayload(getToken());
  return payload?.is_super_admin === true;
};

export const getCurrentUser = () => {
  const payload = parseJwtPayload(getToken());
  return {
    email: payload?.email || '',
    userId: payload?.user_id || null,
  };
};

export const setToken = (token, role = 'viewer', remember = true) => { writeSession(token, role, remember); contextChanged(); };
export const setRole = (role = 'viewer') => writeSessionRole(role);

export const clearToken = () => {
  clearSession();
  localStorage.removeItem('flussio_company_id');
  localStorage.removeItem('flussio_companies');
  sessionStorage.removeItem('flussio_company_id');
  sessionStorage.removeItem('flussio_companies');
  contextChanged();
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

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshContext = { revision: contextRevision, company: getActiveCompanyId() };
      const remember = isPersistentSession();
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      assertContext(refreshContext);
      if (!response.ok) {
        throw new Error('Session refresh failed');
      }

      const data = await response.json();
      assertContext(refreshContext);
      writeSession(data.token, data.role, remember);
      localStorage.setItem('flussio_companies', JSON.stringify(data.companies || []));

      const activeCompanyId = getActiveCompanyId();
      const stillAvailable = (data.companies || []).some(
        (company) => String(company.id) === String(activeCompanyId)
      );
      if (!stillAvailable) {
        setActiveCompanyId(data.default_company_id);
      }

      return {
        previous: refreshContext,
        current: { revision: contextRevision, company: getActiveCompanyId() },
      };
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

const request = async (path, options = {}, retriedAfterRefresh = false, context = { revision: contextRevision, company: getActiveCompanyId() }) => {
  assertContext(context);
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

  const activeCompanyId = getActiveCompanyId();
  if (activeCompanyId) {
    headers['X-Company-Id'] = activeCompanyId;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: fetchOptions.credentials || 'include',
    headers,
  });

  assertContext(context);
  if (response.status === 401 && !retriedAfterRefresh && !path.startsWith('/auth/')) {
    try {
      const refreshed = await refreshAccessToken();
      // With no selected company, refresh may choose the session's default.
      // Only adopt that exact transition; a user/company/session change aborts.
      if (context.company == null && refreshed.previous.company == null &&
          refreshed.previous.revision === context.revision) {
        context = refreshed.current;
      }
      assertContext(context);
      return request(path, options, true, context);
    } catch (failure) {
      if (failure.code === 'CONTEXT_CHANGED') throw failure;
      assertContext(context);
      clearToken();
      window.location.href = '/login';
      const error = new Error('Unauthorized');
      error.code = 'UNAUTHORIZED';
      throw error;
    }
  }

  if (response.status === 401 && path !== '/auth/login') {
    clearToken();
    window.location.href = '/login';
    const error = new Error('Unauthorized');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      assertContext(context);
      const error = new Error(data?.error?.message || data?.message || response.statusText || 'Request failed');
      error.code = data?.error?.code || data?.error_code || (response.status === 413 ? 'FILE_TOO_LARGE' : 'SERVER_ERROR');
      error.details = data?.error?.details || data?.details;
      notifyModuleDenial(error.code);
      throw error;
    }

    const blob = await response.blob();
    assertContext(context);
    return includeHeaders ? { blob, headers: response.headers } : blob;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (jsonError) {
    data = null;
  }

  assertContext(context);
  if (!response.ok) {
    const errorBody = data?.error || null;
    const error = new Error(errorBody?.message || data?.message || response.statusText || 'Request failed');
    error.code = errorBody?.code || data?.error_code || (response.status === 413 ? 'FILE_TOO_LARGE' : 'SERVER_ERROR');
    error.field = errorBody?.field;
    error.details = errorBody?.details || data?.details;
    notifyModuleDenial(error.code);
    throw error;
  }

  return includeHeaders ? { data, headers: response.headers } : data;
};

export const api = {
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getCompanies: () => request('/companies'),
  getCurrentCapabilities: () => request('/modules/current', { cache: 'no-store' }),
  getCompanyModules: (id) => request(`/companies/${id}/modules`),
  getCompanyModuleEvents: (id, before = null) => request(`/companies/${id}/modules/events${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  applyCompanyModules: (id, payload) => request(`/companies/${id}/modules/apply`, { method: 'POST', body: JSON.stringify(payload) }),
  previewCompanyModules: (id, payload) => request(`/companies/${id}/modules/preview`, { method: 'POST', body: JSON.stringify(payload) }),
  createCompany: (payload) => request('/companies', { method: 'POST', body: JSON.stringify(payload) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),
  getAccounts: () => request('/accounts'),
  createAccount: (payload) => request('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateAccount: (id, payload) => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),
  getCategories: (direction) => request(direction ? `/categories?direction=${direction}` : '/categories'),
  createCategory: (payload) => request('/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id, payload) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  getContacts: (search) => request(search ? `/contacts?search=${encodeURIComponent(search)}` : '/contacts'),
  createContact: (payload) => request('/contacts', { method: 'POST', body: JSON.stringify(payload) }),
  updateContact: (id, payload) => request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  getProperties: () => request('/properties'),
  getProperty: (id, filters = {}) => request(`/properties/${id}${toQueryString(filters)}`),
  createProperty: (payload) => request('/properties', { method: 'POST', body: JSON.stringify(payload) }),
  updateProperty: (id, payload) => request(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: 'DELETE' }),
  getJobs: (filters = {}) => {
    const queryString = toQueryString(filters);
    return request(`/jobs${queryString}`);
  },
  getJob: (id) => request(`/jobs/${id}`),
  createJob: (payload) => request('/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  updateJob: (id, payload) => request(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  getJobReportSummary: (jobId, filters = {}) => {
    const queryString = toQueryString(filters);
    return request(`/reports/job/${jobId}/summary${queryString}`);
  },
  exportJobReportCsv: (jobId, filters = {}) => {
    const queryString = toQueryString(filters);
    return request(`/reports/job/${jobId}/export.csv${queryString}`, { responseType: 'blob', includeHeaders: true });
  },

  runAdvancedReport: (spec) => request('/reports/advanced/run', { method: 'POST', body: JSON.stringify(spec) }),
  exportAdvancedReportCsv: (spec) => request('/reports/advanced/export.csv', { method: 'POST', body: JSON.stringify(spec), responseType: 'blob', includeHeaders: true }),
  listSavedReports: () => request('/reports/advanced/saved'),
  createSavedReport: (payload) => request('/reports/advanced/saved', { method: 'POST', body: JSON.stringify(payload) }),
  updateSavedReport: (id, payload) => request(`/reports/advanced/saved/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSavedReport: (id) => request(`/reports/advanced/saved/${id}`, { method: 'DELETE' }),
  getRecurringTemplates: () => request('/recurring-templates'),
  getRecurringStatus: () => request('/recurring-templates/status'),
  getRecurringRuns: (id, offset = 0) => request(`/recurring-templates/${id}/runs${toQueryString({ offset })}`),
  getRecurringTemplate: (id) => request(`/recurring-templates/${id}`),
  createRecurringTemplate: (payload) => request('/recurring-templates', { method: 'POST', body: JSON.stringify(payload) }),
  updateRecurringTemplate: (id, payload) => request(`/recurring-templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  setRecurringTemplateActive: (id, isActive) => request(`/recurring-templates/${id}/active`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) }),
  deleteRecurringTemplate: (id) => request(`/recurring-templates/${id}`, { method: 'DELETE' }),
  generateRecurringTemplateNow: (id) => request(`/recurring-templates/${id}/generate-now`, { method: 'POST' }),
  generateRecurringDue: () => request('/recurring-templates/generate-due', { method: 'POST' }),
  getTransactions: (input = 30) => {
    if (typeof input === 'number') {
      return request(`/transactions?limit=${input}`, { includeHeaders: true });
    }

    const queryString = toQueryString(input);
    return request(`/transactions${queryString}`, { includeHeaders: true });
  },
  exportTransactions: (filters = {}) => {
    const queryString = toQueryString(filters);
    return request(`/transactions/export${queryString}`, { responseType: 'blob', includeHeaders: true });
  },
  exportEntityCsv: (entity) => request(`/export/${entity}.csv`, { responseType: 'blob', includeHeaders: true }),
  importEntityCsv: (entity, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/import/${entity}`, { method: 'POST', body: formData });
  },
  createTransaction: (payload) => request('/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  updateTransaction: (id, payload) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  getAttachments: (transactionId) => request(`/attachments/${transactionId}`),
  uploadAttachment: (transactionId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/attachments/${transactionId}`, { method: 'POST', body: formData });
  },
  downloadAttachment: (attachmentId) => request(`/attachments/file/${attachmentId}`, { responseType: 'blob' }),
  deleteAttachment: (attachmentId) => request(`/attachments/${attachmentId}`, { method: 'DELETE' }),
  getDashboardSummary: (params = {}) => request(`/dashboard/summary${toQueryString(params)}`),
  getDashboardPie: (payload) => request('/dashboard/pie', { method: 'POST', body: JSON.stringify(payload) }),
  getUsers: () => request('/users'),
  getUser: (id) => request(`/users/${id}`),
  createUser: (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createResetToken: (id) => request(`/users/${id}/reset-password-token`, { method: 'POST' }),

  getBranding: () => request('/settings/branding'),
  downloadBrandLogo: () => request('/settings/branding/logo', { responseType: 'blob' }),
  uploadBrandLogo: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/settings/branding/logo', { method: 'POST', body: formData });
  },
  deleteBrandLogo: () => request('/settings/branding/logo', { method: 'DELETE' }),
  downloadBrandIcon: (variant) => request(`/settings/branding/icons/${variant}`, { responseType: 'blob' }),
  uploadBrandIcons: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/settings/branding/icons', { method: 'POST', body: formData });
  },
  deleteBrandIcons: () => request('/settings/branding/icons', { method: 'DELETE' }),
  importMovementsCsv: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/settings/movements/import-csv', { method: 'POST', body: formData });
  },
};
