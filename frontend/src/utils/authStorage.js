const TOKEN_KEY = 'flussio_token';
const ROLE_KEY = 'flussio_role';

export const readSession = (persistent = localStorage, temporary = sessionStorage) => ({
  token: temporary.getItem(TOKEN_KEY) || persistent.getItem(TOKEN_KEY),
  role: temporary.getItem(ROLE_KEY) || persistent.getItem(ROLE_KEY) || 'viewer',
});

export const isPersistentSession = (persistent = localStorage, temporary = sessionStorage) => (
  !temporary.getItem(TOKEN_KEY) && Boolean(persistent.getItem(TOKEN_KEY))
);

export const writeSession = (token, role = 'viewer', remember = true, persistent = localStorage, temporary = sessionStorage) => {
  persistent.removeItem(TOKEN_KEY);
  persistent.removeItem(ROLE_KEY);
  temporary.removeItem(TOKEN_KEY);
  temporary.removeItem(ROLE_KEY);
  const target = remember ? persistent : temporary;
  target.setItem(TOKEN_KEY, token);
  target.setItem(ROLE_KEY, role);
};

export const clearSession = (persistent = localStorage, temporary = sessionStorage) => {
  for (const storage of [persistent, temporary]) {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(ROLE_KEY);
  }
};
