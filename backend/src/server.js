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
    console.error(`Failed to ensure dev user.
Is the database initialized?`, error);
  }

};

const ensurePhase2Schema = async () => {
  try {
    await query(
      `
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        notes TEXT,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
      `
    );

    await query('CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(company_id, is_active)');

    await query(
      'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL'
    );
    await query('CREATE INDEX IF NOT EXISTS idx_transactions_job ON transactions(company_id, job_id)');
  } catch (error) {
    console.error('Failed to ensure Phase 2 schema', error);
  }
};



const ensureAttachmentsSchema = async () => {
  try {
    await query('ALTER TABLE attachments ADD COLUMN IF NOT EXISTS original_name TEXT');
    await query('ALTER TABLE attachments ADD COLUMN IF NOT EXISTS mime_type TEXT');
    await query('ALTER TABLE attachments ADD COLUMN IF NOT EXISTS size INTEGER NOT NULL DEFAULT 0');
    await query('ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_path TEXT');
    await query(
      `
      UPDATE attachments
      SET original_name = COALESCE(original_name, file_name),
          storage_path = COALESCE(storage_path, path)
      WHERE original_name IS NULL OR storage_path IS NULL
      `
    );
    await query('ALTER TABLE attachments ALTER COLUMN original_name SET NOT NULL');
    await query('ALTER TABLE attachments ALTER COLUMN storage_path SET NOT NULL');
  } catch (error) {
    console.error('Failed to ensure attachments schema', error);
  }
};

const bootstrap = async () => {
  await ensurePhase2Schema();
  await ensureAttachmentsSchema();
  await ensureDevUser();

  app.listen(port, () => {
    console.log(`Flussio backend running on port ${port}`);
  });
};

bootstrap();
