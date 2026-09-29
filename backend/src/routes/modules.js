import express from 'express';
import { MODULE_CATALOG, MODULE_CATALOG_VERSION } from '../modules/catalog.js';
import { MODULE_ENFORCEMENT_READY } from '../modules/registry.js';
const router = express.Router();
router.get('/', (_req, res) => res.json({ catalog_version: MODULE_CATALOG_VERSION,
  enforcement_ready: MODULE_ENFORCEMENT_READY, modules: MODULE_CATALOG }));
export default router;
