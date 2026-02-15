import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) return res.status(401).json({ error_code: 'UNAUTHORIZED' });

  try {
    // lascia qui la tua verify JWT e assegnazioni a req.user / req.company_id ecc.
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error_code: 'UNAUTHORIZED' });
  }
}
