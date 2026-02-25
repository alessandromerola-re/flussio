import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { query } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

router.get('/', requirePermission('users_manage'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, role, is_active, created_at FROM users WHERE company_id = $1 ORDER BY id DESC',
      [req.companyId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', requirePermission('users_manage'), async (req, res) => {
  const { email, password, role = 'viewer' } = req.body;
  if (!email || !password || !['admin', 'editor', 'viewer', 'operatore'].includes(role)) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `
      INSERT INTO users (company_id, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, role, is_active, created_at
      `,
      [req.companyId, email, hash, role]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.put('/:id', requirePermission('users_manage'), async (req, res) => {
  const { role, is_active } = req.body;
  if ((role && !['admin', 'editor', 'viewer', 'operatore'].includes(role)) || (is_active != null && typeof is_active !== 'boolean')) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  try {
    const result = await query(
      `
      UPDATE users
      SET role = COALESCE($1, role),
          is_active = COALESCE($2, is_active)
      WHERE id = $3
        AND company_id = $4
      RETURNING id, email, role, is_active, created_at
      `,
      [role ?? null, is_active ?? null, req.params.id, req.companyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/:id/reset-password-token', requirePermission('users_manage'), async (req, res) => {
  const resetEnabled = String(process.env.RESET_EMAIL_ENABLED || 'false').toLowerCase() === 'true';

  try {
    const userResult = await query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.companyId,
    ]);
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
