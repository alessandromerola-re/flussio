import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getClient } from '../db/index.js';

export const REFRESH_COOKIE_NAME = 'flussio_refresh';

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const rememberDays = () => positiveNumber(process.env.AUTH_REFRESH_REMEMBER_DAYS, 30);
const sessionHours = () => positiveNumber(process.env.AUTH_REFRESH_SESSION_HOURS, 12);
const cookieSecure = () => String(process.env.AUTH_COOKIE_SECURE || 'false').toLowerCase() === 'true';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const refreshExpiry = (remember) => new Date(
  Date.now() + (remember ? rememberDays() * 24 : sessionHours()) * 60 * 60 * 1000
);

const parseCookies = (header = '') => Object.fromEntries(
  header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [part, ''];
      const value = part.slice(separator + 1);
      try {
        return [part.slice(0, separator), decodeURIComponent(value)];
      } catch {
        return [part.slice(0, separator), value];
      }
    })
);

export const readRefreshToken = (req) => parseCookies(req.headers.cookie || '')[REFRESH_COOKIE_NAME] || '';

export const setRefreshCookie = (res, token, remember) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/api/auth',
    ...(remember ? { maxAge: rememberDays() * 24 * 60 * 60 * 1000 } : {}),
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/api/auth',
  });
};

export const resolveAccessContext = async (client, user) => {
  let companies = [];

  if (user.is_super_admin === true) {
    const companiesResult = await client.query('SELECT id, name FROM companies ORDER BY name');
    companies = companiesResult.rows.map((company) => ({
      id: company.id,
      name: company.name,
      role: 'super_admin',
    }));
  } else {
    try {
      const companiesResult = await client.query(
        `SELECT c.id, c.name, uc.role
         FROM user_companies uc
         JOIN companies c ON c.id = uc.company_id
         WHERE uc.user_id = $1
           AND uc.is_active = true
         ORDER BY c.name`,
        [user.id]
      );
      companies = companiesResult.rows.map((company) => ({
        id: company.id,
        name: company.name,
        role: company.role,
      }));

      if (companies.length === 0 && user.company_id) {
        const anyMembershipResult = await client.query(
          'SELECT 1 FROM user_companies WHERE user_id = $1 LIMIT 1',
          [user.id]
        );
        if (anyMembershipResult.rowCount === 0) {
          const fallbackCompanyResult = await client.query(
            'SELECT id, name FROM companies WHERE id = $1',
            [user.company_id]
          );
          if (fallbackCompanyResult.rowCount > 0) {
            const fallbackRole = user.role || 'admin';
            companies = [{
              id: fallbackCompanyResult.rows[0].id,
              name: fallbackCompanyResult.rows[0].name,
              role: fallbackRole,
            }];

            await client.query(
              `INSERT INTO user_companies (user_id, company_id, role, is_active)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (user_id, company_id) DO NOTHING`,
              [user.id, user.company_id, fallbackRole]
            );
          }
        }
      }
    } catch (membershipError) {
      if (membershipError?.code !== '42P01') {
        throw membershipError;
      }

      const fallbackCompanyResult = await client.query(
        'SELECT id, name FROM companies WHERE id = $1',
        [user.company_id]
      );
      companies = fallbackCompanyResult.rows.map((company) => ({
        id: company.id,
        name: company.name,
        role: user.role || 'admin',
      }));
    }
  }

  if (companies.length === 0) {
    return null;
  }

  const defaultCompany = companies.find((company) => company.id === user.company_id) || companies[0];
  return {
    companies,
    default_company_id: defaultCompany.id,
    role: defaultCompany.role,
  };
};

export const issueAccessToken = (user, defaultCompanyId) => jwt.sign(
  {
    user_id: user.id,
    email: user.email,
    is_super_admin: user.is_super_admin === true,
    default_company_id: defaultCompanyId,
  },
  process.env.JWT_SECRET,
  {
    expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    jwtid: crypto.randomUUID(),
  }
);

export const createRefreshSession = async (client, userId, remember) => {
  const token = newRefreshToken();
  await client.query(
    `INSERT INTO auth_sessions (user_id, token_hash, remember, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashToken(token), remember, refreshExpiry(remember)]
  );
  return token;
};

export const rotateRefreshSession = async (token) => {
  if (!token) return null;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sessionResult = await client.query(
      `SELECT s.id AS session_id, s.remember, u.*
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       FOR UPDATE OF s`,
      [hashToken(token)]
    );

    if (sessionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const session = sessionResult.rows[0];
    if (session.is_active !== true) {
      await client.query(
        'UPDATE auth_sessions SET revoked_at = NOW(), last_used_at = NOW() WHERE id = $1',
        [session.session_id]
      );
      await client.query('COMMIT');
      return null;
    }

    const context = await resolveAccessContext(client, session);
    if (!context) {
      await client.query(
        'UPDATE auth_sessions SET revoked_at = NOW(), last_used_at = NOW() WHERE id = $1',
        [session.session_id]
      );
      await client.query('COMMIT');
      return null;
    }

    const accessToken = issueAccessToken(session, context.default_company_id);
    const nextRefreshToken = await createRefreshSession(client, session.id, session.remember);
    await client.query(
      'UPDATE auth_sessions SET revoked_at = NOW(), last_used_at = NOW() WHERE id = $1',
      [session.session_id]
    );
    await client.query('COMMIT');

    return {
      token: accessToken,
      refreshToken: nextRefreshToken,
      remember: session.remember,
      ...context,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const revokeRefreshSession = async (token) => {
  if (!token) return;
  const client = await getClient();
  try {
    await client.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, NOW()), last_used_at = NOW()
       WHERE token_hash = $1`,
      [hashToken(token)]
    );
  } finally {
    client.release();
  }
};
