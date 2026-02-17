import { sendError } from '../utils/httpErrors.js';

const levels = {
  viewer: 1,
  operatore: 2,
  editor: 3,
  admin: 4,
};

export const rolePermissions = {
  viewer: { read: true, write: false, delete_sensitive: false, export: false, users_manage: false },
  operatore: { read: true, write: true, delete_sensitive: false, export: false, users_manage: false },
  editor: { read: true, write: true, delete_sensitive: true, export: true, users_manage: false },
  admin: { read: true, write: true, delete_sensitive: true, export: true, users_manage: true },
};

export const getRole = (req) => req.user?.role || 'viewer';

export const requirePermission = (permission) => (req, res, next) => {
  const role = getRole(req);
  const allowed = rolePermissions[role]?.[permission] === true;
  if (!allowed) {
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }
  return next();
};

export const requireMethodPermission = (mapping) => (req, res, next) => {
  const method = req.method.toUpperCase();
  const permission = mapping[method] || mapping.default || 'read';
  return requirePermission(permission)(req, res, next);
};

export const canRole = (role, permission) => rolePermissions[role]?.[permission] === true;
export const isRoleAtLeast = (role, minimumRole) => (levels[role] || 0) >= (levels[minimumRole] || 0);
