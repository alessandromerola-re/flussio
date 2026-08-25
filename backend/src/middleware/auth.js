import jwt from 'jsonwebtoken';
import { sendError } from '../utils/httpErrors.js';
import { query } from '../db/index.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await query(
      'SELECT id, is_active, is_super_admin FROM users WHERE id = $1',
      [payload.user_id]
    );
    if (userResult.rowCount === 0 || userResult.rows[0].is_active !== true) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    req.user = {
      ...payload,
      is_super_admin: userResult.rows[0].is_super_admin === true,
    };
    return next();
  } catch (error) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  }
};
