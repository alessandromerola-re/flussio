import { query } from '../db/index.js';

export const writeAuditLog = async ({
  client = null,
  companyId = null,
  userId = null,
  action,
  entityType,
  entityId = null,
  meta = {},
}) => {
  const executor = client || { query };
  await executor.query(
    `
    INSERT INTO audit_log (company_id, user_id, action, entity_type, entity_id, meta)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [companyId, userId, action, entityType, entityId != null ? String(entityId) : null, JSON.stringify(meta)]
  );
};
