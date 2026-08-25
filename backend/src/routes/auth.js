import express from 'express';
import bcrypt from 'bcryptjs';
import { getClient } from '../db/index.js';
import {
  clearRefreshCookie,
  createRefreshSession,
  issueAccessToken,
  readRefreshToken,
  resolveAccessContext,
  revokeRefreshSession,
  rotateRefreshSession,
  setRefreshCookie,
} from '../services/authSessions.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password, remember = false } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error_code: 'VALIDATION_MISSING_CREDENTIALS' });
  }
  if (typeof remember !== 'boolean') {
    return res.status(400).json({ error_code: 'VALIDATION_INVALID_REMEMBER' });
  }

  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const user = result.rows[0];
    if (user.is_active === false) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error_code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const context = await resolveAccessContext(client, user);
    if (!context) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error_code: 'AUTH_NO_COMPANY_ACCESS' });
    }

    const token = issueAccessToken(user, context.default_company_id);
    const refreshToken = await createRefreshSession(client, user.id, remember);
    await client.query('COMMIT');
    setRefreshCookie(res, refreshToken, remember);

    return res.json({
      token,
      ...context,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // noop
    }
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  } finally {
    client?.release();
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshed = await rotateRefreshSession(readRefreshToken(req));
    if (!refreshed) {
      clearRefreshCookie(res);
      return res.status(401).json({ error_code: 'AUTH_SESSION_EXPIRED' });
    }

    setRefreshCookie(res, refreshed.refreshToken, refreshed.remember);
    return res.json({
      token: refreshed.token,
      default_company_id: refreshed.default_company_id,
      companies: refreshed.companies,
      role: refreshed.role,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error_code: 'SERVER_ERROR' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await revokeRefreshSession(readRefreshToken(req));
  } catch (error) {
    console.error(error);
  } finally {
    clearRefreshCookie(res);
  }
  return res.status(204).send();
});

export default router;
