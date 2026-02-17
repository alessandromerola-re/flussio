import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_CREDENTIALS' });
  }

  try {
    const result = await query(
      'SELECT id, company_id, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const user = result.rows[0];
    if (user.is_active === false) {
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const token = jwt.sign(
      { user_id: user.id, company_id: user.company_id, email: user.email, role: user.role || 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({ token, role: user.role || 'admin' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
