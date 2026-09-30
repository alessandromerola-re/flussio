import express from 'express';
import { MODULE_CATALOG, MODULE_CATALOG_VERSION } from '../modules/catalog.js';
import { MODULE_ENFORCEMENT_READY, readCompanyModules } from '../modules/registry.js';
import { companyContextMiddleware } from '../middleware/companyContext.js';
import { requirePermission, getRole, canRole } from '../middleware/permissions.js';
import { modulePolicy } from '../modules/policy.js';
import { sendModuleError } from '../modules/access.js';

const router = express.Router();
const capabilityActions = {
  read: ['read', 'read'],
  write: ['write', 'write'],
  delete: ['delete', 'delete_sensitive'],
  export: ['export', 'export'],
  import: ['write', 'import'],
  import_movements: ['write', 'import_movements'],
};

// This profile only describes UI affordances. Resource routes still authorize
// every operation against current membership and module state on the server.
router.get('/current', companyContextMiddleware, requirePermission('read'), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const snapshot = await readCompanyModules(req.companyId);
    const states = Object.fromEntries(snapshot.modules.map(module => [module.code, module.state]));
    const role = getRole(req);
    const capabilities = Object.fromEntries(MODULE_CATALOG.flatMap(module =>
      module.capabilities.map(capability => [capability, Object.fromEntries(
        Object.entries(capabilityActions).map(([key, [action, permission]]) => [key,
          modulePolicy.evaluate({ states, capabilities: [capability], action,
            permissionGranted: canRole(role, permission) }).allowed]),
      )]),
    ));
    return res.json({ ...snapshot, role, capabilities });
  } catch (error) {
    return sendModuleError(res, error);
  }
});
router.get('/', (_req, res) => res.json({ catalog_version: MODULE_CATALOG_VERSION,
  enforcement_ready: MODULE_ENFORCEMENT_READY, modules: MODULE_CATALOG }));
export default router;
