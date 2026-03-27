import bcrypt from 'bcryptjs';
import { query } from './db/index.js';

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

const isDevSeedEnabled = () => String(process.env.ENABLE_DEV_SEED || 'false').toLowerCase() === 'true';

export const ensureDevUser = async () => {
  if (!isDevSeedEnabled()) {
    return;
  }

  const devEmail = normalize(process.env.DEV_USER_EMAIL) || 'dev@flussio.local';
  const devPassword = normalize(process.env.DEV_USER_PASSWORD) || 'flussio123';
  const companyName = normalize(process.env.DEV_COMPANY_NAME) || 'Flussio Demo';

  try {
    const companyResult = await query('SELECT id FROM companies WHERE name = $1', [companyName]);
    let companyId = companyResult.rows[0]?.id;
    if (!companyId) {
      const insertCompany = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [companyName]);
      companyId = insertCompany.rows[0].id;
    }

    const userResult = await query('SELECT id FROM users WHERE email = $1', [devEmail]);
    if (userResult.rowCount === 0) {
      const passwordHash = await bcrypt.hash(devPassword, 10);
      const insertUser = await query(
        `INSERT INTO users (company_id, email, password_hash, role, is_super_admin, is_active)
         VALUES ($1, $2, $3, 'admin', true, true) RETURNING id`,
        [companyId, devEmail, passwordHash]
      );
      await query(
        `INSERT INTO user_companies (user_id, company_id, role, is_active)
         VALUES ($1, $2, 'admin', true)
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        [insertUser.rows[0].id, companyId]
      );
      console.log('Development seed user created.');
    }
  } catch (error) {
    console.error('Failed to ensure development seed user.', error);
  }
};

export const ensureBootstrapAdmin = async () => {
  const adminEmail = normalize(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const adminPassword = normalize(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const adminName = normalize(process.env.BOOTSTRAP_ADMIN_NAME) || 'Primary Admin';
  const companyName = normalize(process.env.BOOTSTRAP_COMPANY_NAME) || 'Flussio Company';

  if (!adminEmail || !adminPassword) {
    return;
  }

  if (adminPassword.length < 16) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters long.');
  }

  const usersResult = await query('SELECT id FROM users LIMIT 1');
  if (usersResult.rowCount > 0) {
    console.log('Skipping bootstrap admin creation: users already exist.');
    return;
  }

  const safeCompanyName = companyName || adminName;
  const companyInsert = await query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [safeCompanyName]);
  const companyId = companyInsert.rows[0].id;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const userInsert = await query(
    `INSERT INTO users (company_id, email, password_hash, role, is_super_admin, is_active)
     VALUES ($1, $2, $3, 'admin', true, true)
     RETURNING id`,
    [companyId, adminEmail.toLowerCase(), passwordHash]
  );

  await query(
    `INSERT INTO user_companies (user_id, company_id, role, is_active)
     VALUES ($1, $2, 'admin', true)
     ON CONFLICT (user_id, company_id) DO NOTHING`,
    [userInsert.rows[0].id, companyId]
  );

  console.log(`Bootstrap admin created for company "${safeCompanyName}" (${adminEmail.toLowerCase()}).`);
};
