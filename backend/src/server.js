import bcrypt from 'bcryptjs';
import app from './app.js';
import { query } from './db/index.js';

const port = process.env.PORT || 4000;

const ensureDevUser = async () => {
  const devEmail = process.env.DEV_USER_EMAIL || 'dev@flussio.local';
  const devPassword = process.env.DEV_USER_PASSWORD || 'flussio123';
  const companyName = process.env.DEV_COMPANY_NAME || 'Flussio Demo';

  try {
    const companyResult = await query('SELECT id FROM companies WHERE name = $1', [companyName]);
    let companyId = companyResult.rows[0]?.id;
    if (!companyId) {
      const insertCompany = await query(
        'INSERT INTO companies (name) VALUES ($1) RETURNING id',
        [companyName]
      );
      companyId = insertCompany.rows[0].id;
    }

    const userResult = await query('SELECT id FROM users WHERE email = $1', [devEmail]);
    if (userResult.rowCount === 0) {
      const passwordHash = await bcrypt.hash(devPassword, 10);
      await query(
        'INSERT INTO users (company_id, email, password_hash) VALUES ($1, $2, $3)',
        [companyId, devEmail, passwordHash]
      );
      console.log('Dev user created');
    }
  } catch (error) {
    console.error('Failed to ensure dev user. Is the database initialized?', error);
  }
};

app.listen(port, () => {
  console.log(`Flussio backend running on port ${port}`);
  ensureDevUser();
});
