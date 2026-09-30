import { getClient, query } from '../db/index.js';
import { readCompanyModules } from './registry.js';
import { modulePolicy } from './policy.js';

const fail = (code, status = 400, details = {}) => Object.assign(new Error(code), {code,status,details});
const decimal = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);

// History is administrative. Route membership/role checks precede this company-scoped query.
export async function readModuleEvents(companyId, {before=null,limit=20}={}) {
  if ((before !== null && (!decimal(before) || BigInt(before) > 9223372036854775807n || before === '0'))
    || !Number.isInteger(limit) || limit < 1 || limit > 100) throw fail('MODULE_HISTORY_QUERY_INVALID');
  const result = await query(`SELECT id::text,operation_id,module_code,previous_state,new_state,
    actor_user_id,reason,company_version::text,created_at
    FROM company_module_events WHERE company_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint)
    ORDER BY id DESC LIMIT $3`,[companyId,before,limit+1]);
  const events=result.rows.slice(0,limit);
  return {company_id:companyId,events,next_cursor:result.rows.length>limit ? events.at(-1).id : null};
}

// Preview never applies a transition. Repeatable-read keeps state/version/counts aligned.
export async function previewCompanyModules(companyId, input={}) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw fail('MODULE_PLAN_INVALID');
  const {expected_version,changes}=input;
  if (!decimal(expected_version)) throw fail('MODULE_PLAN_INVALID');
  const client=await getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const current=await readCompanyModules(companyId,{executor:client});
    if (current.version !== expected_version) throw fail('MODULE_VERSION_CONFLICT',409);
    const states=Object.fromEntries(current.modules.map(module=>[module.code,module.state]));
    const result=modulePolicy.preview(states,changes);
    if (!result.allowed) throw fail(result.code,result.code === 'MODULE_PLAN_INVALID' ? 400 : 409,{module:result.module,dependency:result.dependency,cause:result.cause});
    const impact=[];
    for (const change of result.changes) {
      if (change.from===change.to) continue;
      let counts={records:'0',linked_movements:'0',active_recurring:'0'};
      // The fixed catalog owns these identifiers; nothing from an HTTP request is interpolated.
      const entity=change.module==='jobs'?'jobs':change.module==='real_estate'?'properties':null;
      const field=change.module==='jobs'?'job_id':change.module==='real_estate'?'property_id':null;
      if (entity) {
        const count=await client.query(`SELECT
          (SELECT COUNT(*) FROM ${entity} WHERE company_id=$1)::text AS records,
          (SELECT COUNT(*) FROM transactions WHERE company_id=$1 AND ${field} IS NOT NULL)::text AS linked_movements,
          (SELECT COUNT(*) FROM recurring_templates WHERE company_id=$1 AND ${field} IS NOT NULL AND is_active=true)::text AS active_recurring`,[companyId]);
        counts=count.rows[0];
      }
      impact.push({...change,...counts});
    }
    await client.query('COMMIT');
    return {company_id:companyId,version:current.version,enforcement_ready:current.enforcement_ready,
      can_apply:current.enforcement_ready && impact.length > 0,changes:result.changes,impact};
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally {client.release();}
}
