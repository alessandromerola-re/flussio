export const rolePermissions = {
  viewer: { read: true, write: false, delete_sensitive: false, export: false, users_manage: false },
  operatore: { read: true, write: true, delete_sensitive: false, export: false, users_manage: false },
  editor: { read: true, write: true, delete_sensitive: true, export: true, users_manage: false },
  admin: { read: true, write: true, delete_sensitive: true, export: true, users_manage: true },
  super_admin: { read: true, write: true, delete_sensitive: true, export: true, users_manage: true },
};

const actionToPermission = {
  read: 'read',
  create: 'write',
  update: 'write',
  delete: 'delete_sensitive',
  export: 'export',
  manage_users: 'users_manage',
};

export const getRole = () => localStorage.getItem('flussio_role') || 'viewer';
export const isRoadmapEnabled = () => String(import.meta.env.VITE_SHOW_ROADMAP || 'false').toLowerCase() === 'true';

export const canPermission = (permission, role = getRole()) => Boolean(rolePermissions[role]?.[permission]);

export const can = (action, resource = null, role = getRole()) => {
  if (resource === 'roadmap') {
    return canPermission('users_manage', role) && isRoadmapEnabled();
  }
  const permission = actionToPermission[action] || action;
  return canPermission(permission, role);
};
