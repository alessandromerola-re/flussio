import jwt from 'jsonwebtoken';
import { sendError } from '../utils/httpErrors.js';

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required.');
  }
};
