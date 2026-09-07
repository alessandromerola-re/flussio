export const rolePermissions = {
  viewer: { read: true, write: false, delete_sensitive: false, import: false, import_movements: false, export: false, users_manage: false },
  operatore: { read: true, write: true, delete_sensitive: false, import: false, import_movements: false, export: false, users_manage: false },
  editor: { read: true, write: true, delete_sensitive: true, import: true, import_movements: false, export: true, users_manage: false },
  admin: { read: true, write: true, delete_sensitive: true, import: true, import_movements: true, export: true, users_manage: true },
  super_admin: { read: true, write: true, delete_sensitive: true, import: true, import_movements: true, export: true, users_manage: true },
};

const actionToPermission = {
  read: 'read',
  create: 'write',
  update: 'write',
  delete: 'delete_sensitive',
  export: 'export',
  manage_users: 'users_manage',
};

export const getRole = getStoredRole;
export const isRecurringEnabled = () => String(import.meta.env.VITE_SHOW_RECURRING || 'false').toLowerCase() === 'true';

export const canPermission = (permission, role = getRole()) => Boolean(rolePermissions[role]?.[permission]);

export const can = (action, resource = null, role = getRole()) => {
  if (resource === 'roadmap') {
    return false;
  }
  const permission = actionToPermission[action] || action;
  return canPermission(permission, role);
};
import { getRole as getStoredRole } from '../services/api.js';
