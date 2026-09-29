import { MODULE_CATALOG, MODULE_STATES, validateModuleCatalog } from './catalog.js';

const actions = new Set(['read', 'export', 'write', 'delete', 'run']);
const readActions = new Set(['read', 'export']);
const failure = (code, details = {}) => ({ allowed: false, code, ...details });

// Pure policy primitives: not wired to HTTP, database writes or workers in M0.
// Caller must obtain states and permissionGranted from a verified company context.
export function createModulePolicy(catalog = MODULE_CATALOG) {
  validateModuleCatalog(catalog);
  // Copy input so changes to a supplied catalog cannot change the policy after validation.
  const modules = new Map(catalog.map(module => [module.code, {
    ...module, dependencies: [...module.dependencies], capabilities: [...module.capabilities],
  }]));
  const owners = new Map([...modules.values()].flatMap(module => module.capabilities.map(capability => [capability, module.code])));
  const stateOf = (states, code) => code === 'core' ? 'enabled'
    : Object.hasOwn(states, code) ? states[code] : 'disabled';

  const checkModule = (code, action, states, seen = new Set()) => {
    const module = modules.get(code);
    if (!module) return failure('MODULE_UNKNOWN', { module: code });
    if (!module.available) return failure('MODULE_UNAVAILABLE', { module: code });
    const state = stateOf(states, code);
    if (!MODULE_STATES.includes(state)) return failure('MODULE_STATE_INVALID', { module: code });
    if (state === 'disabled') return failure('MODULE_DISABLED', { module: code });
    if (state === 'read_only' && !readActions.has(action)) return failure('MODULE_READ_ONLY', { module: code });
    if (seen.has(code)) return { allowed: true };
    seen.add(code);
    for (const dependency of module.dependencies) {
      const result = checkModule(dependency, action, states, seen);
      if (!result.allowed) return failure('MODULE_DEPENDENCY_MISSING', { module: code, dependency, cause: result.code });
    }
    return { allowed: true };
  };

  return Object.freeze({
    evaluate({ capabilities, action, states = {}, permissionGranted = false, technicalEnabled = true } = {}) {
      if (permissionGranted !== true) return failure('FORBIDDEN');
      if (technicalEnabled !== true) return failure('FEATURE_UNAVAILABLE');
      if (!actions.has(action)) return failure('MODULE_ACTION_INVALID');
      if (!states || typeof states !== 'object' || Array.isArray(states)) return failure('MODULE_STATE_INVALID');
      if (!Array.isArray(capabilities) || capabilities.length === 0) return failure('MODULE_CAPABILITY_UNKNOWN');
      for (const capability of capabilities) {
        if (!owners.has(capability)) return failure('MODULE_CAPABILITY_UNKNOWN');
        const result = checkModule(owners.get(capability), action, states);
        if (!result.allowed) return result;
      }
      return { allowed: true };
    },
    // Validates an explicit hypothetical plan only. M1 adds auth, versioning, locks and audit.
    preview(states, changes) {
      if (!states || typeof states !== 'object' || Array.isArray(states)
        || !Array.isArray(changes) || changes.length === 0) return failure('MODULE_PLAN_INVALID');
      const next = Object.assign(Object.create(null), states), seen = new Set();
      for (const change of changes) {
        if (!change || !modules.has(change.module)) return failure('MODULE_UNKNOWN');
        if (change.module === 'core') return failure('MODULE_CORE_IMMUTABLE');
        if (seen.has(change.module) || !MODULE_STATES.includes(change.state)) return failure('MODULE_PLAN_INVALID');
        seen.add(change.module);
        if (change.state !== 'disabled' && !modules.get(change.module).available) return failure('MODULE_UNAVAILABLE', { module: change.module });
        next[change.module] = change.state;
      }
      for (const [code, state] of Object.entries(next)) {
        if (!modules.has(code)) return failure('MODULE_UNKNOWN', { module: code });
        if (!MODULE_STATES.includes(state) || (code === 'core' && state !== 'enabled')) return failure('MODULE_STATE_INVALID', { module: code });
      }
      // Validate the complete target, including unchanged dependents; never cascade silently.
      for (const code of modules.keys()) {
        const state = stateOf(next, code);
        if (state === 'disabled') continue;
        const result = checkModule(code, state === 'enabled' ? 'write' : 'read', next);
        if (!result.allowed) return result;
      }
      return { allowed: true, states: { ...next, core: 'enabled' }, changes: changes.map(change => ({
        module: change.module, from: stateOf(states, change.module), to: change.state,
      })) };
    },
  });
}
export const modulePolicy = createModulePolicy();
