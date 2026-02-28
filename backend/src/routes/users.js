import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { getClient, query } from '../db/index.js';
import { requirePermission } from '../middleware/permissions.js';

const VALID_ROLES = ['admin', 'editor', 'viewer', 'operatore'];

const router = express.Router();

const normalizeMemberships = (memberships = []) => {
  if (!Array.isArray(memberships)) {
    return null;
  }

  const normalized = memberships
    .map((membership) => ({
      company_id: Number(membership?.company_id),
      role: membership?.role,
      is_active: membership?.is_active !== false,
    }))
    .filter((membership) => Number.isInteger(membership.company_id) && VALID_ROLES.includes(membership.role));

  const dedup = [];
  const seen = new Set();
  for (const membership of normalized) {
    if (seen.has(membership.company_id)) continue;
    seen.add(membership.company_id);
    dedup.push(membership);
  }

  return dedup;
};

const loadUserMemberships = async (userId) => {
  const memberships = await query(
    `SELECT uc.company_id, c.name AS company_name, uc.role, uc.is_active
     FROM user_companies uc
     JOIN companies c ON c.id = uc.company_id
     WHERE uc.user_id = $1
     ORDER BY c.name`,
    [userId]
  );
  return memberships.rows;
};

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

router.get('/:id', requirePermission('users_manage'), async (req, res) => {
  try {
    const userResult = await query('SELECT id, email, is_active FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const accessResult = await query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );

    if (accessResult.rowCount === 0 && req.user?.is_super_admin !== true) {
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const memberships = await loadUserMemberships(req.params.id);

    return res.json({
      ...userResult.rows[0],
      memberships,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/', requirePermission('users_manage'), async (req, res) => {
  const { email, password, role = 'viewer', memberships } = req.body;
  if (!email || (!VALID_ROLES.includes(role) && !Array.isArray(memberships))) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const parsedMemberships = normalizeMemberships(memberships);
  if (Array.isArray(memberships) && parsedMemberships == null) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const desiredMemberships = req.user?.is_super_admin === true && parsedMemberships?.length > 0
    ? parsedMemberships
    : [{ company_id: req.companyId, role, is_active: true }];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const companiesResult = await client.query(
      'SELECT id FROM companies WHERE id = ANY($1::int[])',
      [desiredMemberships.map((membership) => membership.company_id)]
    );
    if (companiesResult.rowCount !== desiredMemberships.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
    }

    const existingUser = await client.query('SELECT id, email, is_active FROM users WHERE email = $1', [email]);

    let userId;
    let userEmail;
    let userIsActive;

    if (existingUser.rowCount === 0) {
      if (!password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
      }

      const hash = await bcrypt.hash(password, 10);
      const primaryCompanyId = desiredMemberships[0].company_id;
      const createUser = await client.query(
        `INSERT INTO users (company_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, is_active`,
        [primaryCompanyId, email, hash]
      );

      userId = createUser.rows[0].id;
      userEmail = createUser.rows[0].email;
      userIsActive = createUser.rows[0].is_active;
    } else {
      userId = existingUser.rows[0].id;
      userEmail = existingUser.rows[0].email;
      userIsActive = existingUser.rows[0].is_active;
    }

    for (const membership of desiredMemberships) {
      await client.query(
        `INSERT INTO user_companies (user_id, company_id, role, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, company_id)
         DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
        [userId, membership.company_id, membership.role, membership.is_active]
      );
    }

    const membershipsResult = await client.query(
      `SELECT uc.company_id, c.name AS company_name, uc.role, uc.is_active
       FROM user_companies uc
       JOIN companies c ON c.id = uc.company_id
       WHERE uc.user_id = $1
       ORDER BY c.name`,
      [userId]
    );

    await client.query('COMMIT');

    const currentCompanyMembership = membershipsResult.rows.find((membership) => membership.company_id === req.companyId)
      || membershipsResult.rows[0];

    return res.status(201).json({
      id: userId,
      email: userEmail,
      is_active: userIsActive,
      role: currentCompanyMembership?.role || role,
      membership_active: currentCompanyMembership?.is_active ?? true,
      memberships: membershipsResult.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.put('/:id', requirePermission('users_manage'), async (req, res) => {
  const { role, membership_active, memberships, email, is_active } = req.body;

  if ((role && !VALID_ROLES.includes(role)) || (membership_active != null && typeof membership_active !== 'boolean')) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const parsedMemberships = memberships == null ? null : normalizeMemberships(memberships);
  if (memberships != null && parsedMemberships == null) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const userResult = await client.query('SELECT id, email, is_active FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    const membershipAccess = await client.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );
    if (membershipAccess.rowCount === 0 && req.user?.is_super_admin !== true) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error_code: 'NOT_FOUND' });
    }

    if (email || typeof is_active === 'boolean') {
      await client.query(
        `UPDATE users
         SET email = COALESCE($1, email),
             is_active = COALESCE($2, is_active)
         WHERE id = $3`,
        [email ?? null, is_active ?? null, req.params.id]
      );
    }

    if (req.user?.is_super_admin === true && parsedMemberships) {
      if (parsedMemberships.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
      }

      const companiesResult = await client.query(
        'SELECT id FROM companies WHERE id = ANY($1::int[])',
        [parsedMemberships.map((membership) => membership.company_id)]
      );
      if (companiesResult.rowCount !== parsedMemberships.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error_code: 'VALIDATION_MISSING_FIELDS' });
      }

      await client.query(
        `UPDATE user_companies
         SET is_active = false
         WHERE user_id = $1
           AND company_id <> ALL($2::int[])`,
        [req.params.id, parsedMemberships.map((membership) => membership.company_id)]
      );

      for (const membership of parsedMemberships) {
        await client.query(
          `INSERT INTO user_companies (user_id, company_id, role, is_active)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, company_id)
           DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
          [req.params.id, membership.company_id, membership.role, membership.is_active]
        );
      }
    } else {
      const result = await client.query(
        `UPDATE user_companies
         SET role = COALESCE($1, role),
             is_active = COALESCE($2, is_active)
         WHERE user_id = $3
           AND company_id = $4
         RETURNING role, is_active AS membership_active`,
        [role ?? null, membership_active ?? null, req.params.id, req.companyId]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error_code: 'NOT_FOUND' });
      }
    }

    const updatedUserResult = await client.query('SELECT id, email, is_active FROM users WHERE id = $1', [req.params.id]);
    const membershipsResult = await client.query(
      `SELECT uc.company_id, c.name AS company_name, uc.role, uc.is_active
       FROM user_companies uc
       JOIN companies c ON c.id = uc.company_id
       WHERE uc.user_id = $1
       ORDER BY c.name`,
      [req.params.id]
    );

    await client.query('COMMIT');

    const currentMembership = membershipsResult.rows.find((membership) => membership.company_id === req.companyId)
      || membershipsResult.rows[0];

    return res.json({
      id: updatedUserResult.rows[0].id,
      email: updatedUserResult.rows[0].email,
      is_active: updatedUserResult.rows[0].is_active,
      role: currentMembership?.role || 'viewer',
      membership_active: currentMembership?.is_active ?? false,
      memberships: membershipsResult.rows,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client.release();
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
