import { query } from '../db/index.js';
import { sendError } from '../utils/httpErrors.js';

const parseCompanyId = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;
  return Number.parseInt(normalized, 10);
};

const applyLegacyCompanyFallback = async (req, companyId) => {
  const legacyResult = await query(
    `SELECT role
     FROM users
     WHERE id = $1
       AND company_id = $2
       AND is_active = true`,
    [req.user?.user_id, companyId]
  );

  if (legacyResult.rowCount === 0) {
    return false;
  }

  req.companyId = companyId;
  req.companyRole = legacyResult.rows[0].role || 'admin';
  return true;
};

export const companyContextMiddleware = async (req, res, next) => {
  const headerCompanyId = req.header('X-Company-Id');
  const candidateCompanyId = headerCompanyId ?? req.user?.default_company_id;
  const companyId = parseCompanyId(candidateCompanyId);

  if (!Number.isInteger(companyId)) {
    return sendError(res, 400, 'VALIDATION_INVALID_COMPANY_ID', 'Invalid company id.');
  }

  try {
    if (req.user?.is_super_admin === true) {
      const existsResult = await query('SELECT 1 FROM companies WHERE id = $1', [companyId]);
      if (existsResult.rowCount === 0) {
        return sendError(res, 403, 'FORBIDDEN', 'You do not have access to this company.');
      }

      req.companyId = companyId;
      req.companyRole = 'super_admin';
      return next();
    }

    try {
      const membershipResult = await query(
        `SELECT role
         FROM user_companies
         WHERE user_id = $1
           AND company_id = $2
           AND is_active = true`,
        [req.user?.user_id, companyId]
      );

      if (membershipResult.rowCount > 0) {
        req.companyId = companyId;
        req.companyRole = membershipResult.rows[0].role;
        return next();
      }

      const legacyAllowed = await applyLegacyCompanyFallback(req, companyId);
      if (legacyAllowed) {
        return next();
      }

      return sendError(res, 403, 'FORBIDDEN', 'You do not have access to this company.');
    } catch (membershipError) {
      if (membershipError?.code !== '42P01') {
        throw membershipError;
      }

      const legacyAllowed = await applyLegacyCompanyFallback(req, companyId);
      if (legacyAllowed) {
        return next();
      }

      return sendError(res, 403, 'FORBIDDEN', 'You do not have access to this company.');
    }
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'SERVER_ERROR', 'Internal server error.');
  }
};
