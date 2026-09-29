// Catalog revision is independent of the application release number.
export const MODULE_CATALOG_VERSION = 1;
export const MODULE_STATES = Object.freeze(['enabled', 'read_only', 'disabled']);

const definitions = [
  { code: 'core', name: 'Base', available: true, dependencies: [], capabilities: ['finance', 'general_reports', 'recurring'] },
  { code: 'jobs', name: 'Commesse', available: true, dependencies: ['core'], capabilities: ['jobs', 'job_reports', 'job_links'] },
  { code: 'real_estate', name: 'Immobiliare', available: true, dependencies: ['core'], capabilities: ['properties', 'property_reports', 'property_links'] },
  { code: 'wealth', name: 'Family Office', available: false, dependencies: ['core'], capabilities: ['wealth'] },
  { code: 'investments', name: 'Investimenti evoluti', available: false, dependencies: ['wealth'], capabilities: ['investments'] },
  { code: 'market_data', name: 'Prezzi automatici', available: false, dependencies: ['investments'], capabilities: ['market_data'] },
  { code: 'crypto_sync', name: 'Crypto e Hyperliquid', available: false, dependencies: ['investments', 'market_data'], capabilities: ['crypto_sync'] },
  { code: 'api_excel', name: 'API ed Excel', available: false, dependencies: ['core'], capabilities: ['api_excel'] },
];

export function validateModuleCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new Error('Invalid module catalog');
  const modules = new Map(), capabilities = new Set();
  for (const module of catalog) {
    if (!module || typeof module.code !== 'string' || !/^[a-z][a-z0-9_]*$/.test(module.code)
      || modules.has(module.code) || typeof module.available !== 'boolean'
      || !Array.isArray(module.dependencies) || !Array.isArray(module.capabilities)) throw new Error('Invalid module definition');
    if (new Set(module.dependencies).size !== module.dependencies.length) throw new Error('Duplicate dependency');
    modules.set(module.code, module);
    for (const capability of module.capabilities) {
      if (typeof capability !== 'string' || !/^[a-z][a-z0-9_]*$/.test(capability) || capabilities.has(capability)) throw new Error('Invalid or duplicate capability');
      capabilities.add(capability);
    }
  }
  const core = modules.get('core');
  if (!core?.available || core.dependencies.length) throw new Error('Core must always be available without dependencies');
  const visiting = new Set(), visited = new Set();
  const visit = code => {
    if (visiting.has(code)) throw new Error('Cyclic module dependencies');
    const module = modules.get(code);
    if (!module) throw new Error(`Unknown dependency: ${code}`);
    if (visited.has(code)) return;
    visiting.add(code);
    module.dependencies.forEach(visit);
    visiting.delete(code); visited.add(code);
  };
  modules.forEach((_, code) => visit(code));
  return true;
}

validateModuleCatalog(definitions);
export const MODULE_CATALOG = Object.freeze(definitions.map(module => Object.freeze({
  ...module, dependencies: Object.freeze(module.dependencies), capabilities: Object.freeze(module.capabilities),
})));

// Explicit baseline for the one-time migration, never a fallback during access checks.
export const LEGACY_MODULE_CODES = Object.freeze(['jobs', 'real_estate']);
// Missing optional rows mean disabled; a new company gets core only.
export const NEW_COMPANY_MODULE_STATES = Object.freeze({ core: 'enabled' });
