import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error_code: 'UNAUTHORIZED' });
  }

  const [, token] = header.split(' ');
  if (!token) {
    return res.status(401).json({ error_code: 'UNAUTHORIZED' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error_code: 'UNAUTHORIZED' });
  }
};
