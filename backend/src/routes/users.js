import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { query } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';

const VALID_ROLES = ['admin', 'editor', 'viewer', 'operatore'];

const router = express.Router();

router.get('/', requirePermission('users_manage'), async (req, res) => {
  try {
    const result = await query(
      `SELECT
         u.id,
         u.email,
         u.is_active,
         uc.role,
         uc.is_active AS membership_active,
         uc.created_at
       FROM user_companies uc
       JOIN users u ON u.id = uc.user_id
       WHERE uc.company_id = $1
       ORDER BY u.id DESC`,
      [req.companyId]
    );
    return res.json(result.rows);
  } catch (error) {
    if (error?.code === '42P01') {
      try {
        const fallback = await query(
          `SELECT id, email, is_active, role, is_active AS membership_active, created_at
           FROM users
           WHERE company_id = $1
           ORDER BY id DESC`,
          [req.companyId]
        );
        return res.json(fallback.rows);
      } catch (fallbackError) {
        console.error(fallbackError);
      }
    }
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', requirePermission('users_manage'), async (req, res) => {
  const { email, password, role = 'viewer' } = req.body;
  if (!email || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const existingUser = await query('SELECT id, email, is_active FROM users WHERE email = $1', [email]);

    let userId;
    let userEmail;
    let userIsActive;

    if (existingUser.rowCount === 0) {
      if (!password) {
        return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
      }

      const hash = await bcrypt.hash(password, 10);
      const createUser = await query(
        `INSERT INTO users (company_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, is_active`,
        [req.companyId, email, hash]
      );

      userId = createUser.rows[0].id;
      userEmail = createUser.rows[0].email;
      userIsActive = createUser.rows[0].is_active;
    } else {
      userId = existingUser.rows[0].id;
      userEmail = existingUser.rows[0].email;
      userIsActive = existingUser.rows[0].is_active;
    }

    await query(
      `INSERT INTO user_companies (user_id, company_id, role, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [userId, req.companyId, role]
    );

    const membership = await query(
      `SELECT role, is_active AS membership_active, created_at
       FROM user_companies
       WHERE user_id = $1
         AND company_id = $2`,
      [userId, req.companyId]
    );

    return res.status(201).json({
      id: userId,
      email: userEmail,
      is_active: userIsActive,
      role: membership.rows[0].role,
      membership_active: membership.rows[0].membership_active,
      created_at: membership.rows[0].created_at,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', requirePermission('users_manage'), async (req, res) => {
  const { role, membership_active } = req.body;
  if ((role && !VALID_ROLES.includes(role)) || (membership_active != null && typeof membership_active !== 'boolean')) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      `UPDATE user_companies
       SET role = COALESCE($1, role),
           is_active = COALESCE($2, is_active)
       WHERE user_id = $3
         AND company_id = $4
       RETURNING role, is_active AS membership_active, created_at`,
      [role ?? null, membership_active ?? null, req.params.id, req.companyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const userResult = await query('SELECT id, email, is_active FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    return res.json({
      id: userResult.rows[0].id,
      email: userResult.rows[0].email,
      is_active: userResult.rows[0].is_active,
      role: result.rows[0].role,
      membership_active: result.rows[0].membership_active,
      created_at: result.rows[0].created_at,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/:id/reset-password-token', requirePermission('users_manage'), async (req, res) => {
  const resetEnabled = String(process.env.RESET_EMAIL_ENABLED || 'false').toLowerCase() === 'true';

  try {
    const userResult = await query(
      'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [req.params.id, token, expiresAt]
    );

    return res.json({
      status: 'created',
      expires_at: expiresAt,
      token: resetEnabled ? null : token,
      delivery: resetEnabled ? 'email' : 'admin_manual',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

export default router;
