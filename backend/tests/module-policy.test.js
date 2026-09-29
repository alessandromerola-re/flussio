import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_CATALOG, LEGACY_MODULE_CODES, NEW_COMPANY_MODULE_STATES, validateModuleCatalog } from '../src/modules/catalog.js';
import { createModulePolicy, modulePolicy } from '../src/modules/policy.js';
const evaluate = (extra = {}) => modulePolicy.evaluate({ capabilities: ['jobs'], action: 'read', permissionGranted: true, ...extra });
const future = () => createModulePolicy(MODULE_CATALOG.map(module => ({ ...module, available: true })));

test('catalog is immutable, separates release availability and conservative legacy migration', () => {
  assert.deepEqual(MODULE_CATALOG.filter(m => m.available).map(m => m.code), ['core','jobs','real_estate']);
  assert.deepEqual(LEGACY_MODULE_CODES, ['jobs','real_estate']);
  assert.deepEqual(NEW_COMPANY_MODULE_STATES, {core:'enabled'});
  assert.throws(() => MODULE_CATALOG[1].dependencies.push('wealth'), TypeError);
  assert.throws(() => { MODULE_CATALOG[3].available = true; }, TypeError);
});
test('catalog rejects unknown dependencies, cycles, duplicate codes/capabilities and invalid core', () => {
  const copy=()=>MODULE_CATALOG.map(m=>({...m,dependencies:[...m.dependencies],capabilities:[...m.capabilities]}));
  let c=copy();c[1].dependencies=['absent'];assert.throws(()=>validateModuleCatalog(c));
  c=copy();c[1].dependencies=['real_estate'];c[2].dependencies=['jobs'];assert.throws(()=>validateModuleCatalog(c));
  c=copy();c.push(c[1]);assert.throws(()=>validateModuleCatalog(c));
  c=copy();c[1].capabilities.push('finance');assert.throws(()=>validateModuleCatalog(c));
  c=copy();c[0].available=false;assert.throws(()=>validateModuleCatalog(c));
});
test('core is always enabled while missing optional rows deny access', () => {
  assert.deepEqual(evaluate({capabilities:['finance'],states:{core:'disabled'}}),{allowed:true});
  assert.equal(evaluate().code,'MODULE_DISABLED');
  assert.equal(evaluate({states:{jobs:'enabled'}}).allowed,true);
  assert.equal(evaluate({states:Object.create({jobs:'enabled'})}).code,'MODULE_DISABLED');
});
test('permissions and technical flags take precedence over all module states', () => {
  assert.equal(evaluate({states:{jobs:'enabled'},permissionGranted:false}).code,'FORBIDDEN');
  assert.equal(evaluate({states:{jobs:'enabled'},technicalEnabled:false}).code,'FEATURE_UNAVAILABLE');
  assert.equal(modulePolicy.evaluate({capabilities:['finance'],action:'read'}).code,'FORBIDDEN');
});
test('read-only allows authorized reading and export, blocking writes, deletion and workers', () => {
  for(const action of ['read','export']) assert.equal(evaluate({action,states:{jobs:'read_only'}}).allowed,true);
  for(const action of ['write','delete','run']) assert.equal(evaluate({action,states:{jobs:'read_only'}}).code,'MODULE_READ_ONLY');
});
test('unknown actions, capabilities and states fail closed; future modules stay unavailable', () => {
  assert.equal(evaluate({action:'anything'}).code,'MODULE_ACTION_INVALID');
  assert.equal(evaluate({capabilities:['constructor']}).code,'MODULE_CAPABILITY_UNKNOWN');
  assert.equal(evaluate({capabilities:[]}).code,'MODULE_CAPABILITY_UNKNOWN');
  assert.equal(evaluate({states:{jobs:'yes'}}).code,'MODULE_STATE_INVALID');
  assert.equal(evaluate({capabilities:['wealth'],states:{wealth:'enabled'}}).code,'MODULE_UNAVAILABLE');
});
test('combined capabilities require both modules without restricting unrelated core reports', () => {
  assert.equal(evaluate({capabilities:['jobs','properties'],states:{jobs:'enabled'}}).code,'MODULE_DISABLED');
  assert.equal(evaluate({capabilities:['general_reports'],states:{jobs:'disabled',real_estate:'disabled'}}).allowed,true);
});
test('preview cannot change core, activate unavailable modules or accept duplicate transitions', () => {
  assert.equal(modulePolicy.preview({},[{module:'core',state:'disabled'}]).code,'MODULE_CORE_IMMUTABLE');
  assert.equal(modulePolicy.preview({},[{module:'wealth',state:'enabled'}]).code,'MODULE_UNAVAILABLE');
  assert.equal(modulePolicy.preview({},[{module:'jobs',state:'enabled'},{module:'jobs',state:'disabled'}]).code,'MODULE_PLAN_INVALID');
  assert.equal(modulePolicy.preview({},[{module:'absent',state:'enabled'}]).code,'MODULE_UNKNOWN');
});
test('preview is pure and preserves unrelated states with no implicit activation', () => {
  const states=Object.freeze({jobs:'enabled',real_estate:'enabled'});
  const plan=Object.freeze([Object.freeze({module:'jobs',state:'read_only'})]);
  const result=modulePolicy.preview(states,plan);
  assert.equal(result.allowed,true);assert.equal(result.states.real_estate,'enabled');
  assert.equal(states.jobs,'enabled');assert.deepEqual(result.changes,[{module:'jobs',from:'enabled',to:'read_only'}]);
  assert.equal(modulePolicy.preview(result.states,[{module:'jobs',state:'enabled'}]).allowed,true);
});
test('future dependency graph requires transitive dependencies and validates unchanged dependents', () => {
  const policy=future();
  assert.equal(policy.preview({},[{module:'investments',state:'enabled'}]).code,'MODULE_DEPENDENCY_MISSING');
  const states={wealth:'enabled',investments:'enabled',market_data:'enabled',crypto_sync:'enabled'};
  assert.equal(policy.evaluate({capabilities:['crypto_sync'],action:'write',states,permissionGranted:true}).allowed,true);
  assert.equal(policy.preview(states,[{module:'wealth',state:'read_only'}]).code,'MODULE_DEPENDENCY_MISSING');
  const plan=Object.keys(states).map(module=>({module,state:'read_only'}));
  assert.equal(policy.preview(states,plan).allowed,true);
  assert.equal(policy.preview(states,Object.keys(states).map(module=>({module,state:'disabled'}))).allowed,true);
  assert.equal(policy.evaluate({capabilities:['crypto_sync'],action:'read',states:{...states,wealth:'disabled'},permissionGranted:true}).code,'MODULE_DEPENDENCY_MISSING');
});
