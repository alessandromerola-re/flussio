import bcrypt from 'bcryptjs';
import app from './app.js';
import { query } from './db/index.js';
import { generateDueTemplates } from './services/recurring.js';

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

    await query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title TEXT');
    await query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS code TEXT');
    await query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false');
    await query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget NUMERIC(12, 2)');
    await query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_date DATE');
    await query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS end_date DATE');
    await query('UPDATE jobs SET title = COALESCE(title, name) WHERE title IS NULL');
    await query('ALTER TABLE jobs ALTER COLUMN title SET NOT NULL');

    await query('CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(company_id, is_active)');
    await query('CREATE INDEX IF NOT EXISTS idx_jobs_company_active ON jobs(company_id, is_active, is_closed)');
    await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_company_code_unique ON jobs(company_id, code) WHERE code IS NOT NULL');

    await query(
      'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL'
    );
    await query('CREATE INDEX IF NOT EXISTS idx_transactions_job ON transactions(company_id, job_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_transactions_company_job_date ON transactions(company_id, job_id, date)');

    await query(
      `
      CREATE TABLE IF NOT EXISTS recurring_templates (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
        interval INTEGER NOT NULL DEFAULT 1,
        start_date DATE,
        end_date DATE,
        next_run_at TIMESTAMP NOT NULL,
        last_run_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true,
        amount NUMERIC(12, 2) NOT NULL,
        movement_type TEXT NOT NULL CHECK (movement_type IN ('income', 'expense')),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
        property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        notes TEXT,
        weekly_anchor_dow INTEGER,
        yearly_anchor_mm INTEGER,
        yearly_anchor_dd INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
      `
    );

    await query(
      `
      CREATE TABLE IF NOT EXISTS recurring_runs (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
        cycle_key TEXT NOT NULL,
        run_at TIMESTAMP NOT NULL,
        run_type TEXT NOT NULL CHECK (run_type IN ('auto', 'manual')),
        generated_movement_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (template_id, cycle_key)
      )
      `
    );

    await query(
      'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_template_id INTEGER REFERENCES recurring_templates(id) ON DELETE SET NULL'
    );
    await query('CREATE INDEX IF NOT EXISTS idx_recurring_templates_due ON recurring_templates(is_active, next_run_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_recurring_runs_template_cycle ON recurring_runs(template_id, cycle_key)');
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



const startRecurringScheduler = () => {
  const enabledRaw = process.env.RECURRING_GENERATOR_ENABLED;
  const enabled = enabledRaw == null ? true : String(enabledRaw).toLowerCase() === 'true';
  const intervalMinutes = Number(process.env.RECURRING_GENERATOR_INTERVAL_MIN || 5);

  if (!enabled) {
    console.log('Recurring generator disabled by env');
    return;
  }

  const run = async () => {
    try {
      const result = await generateDueTemplates({ runType: 'auto' });
      if (result.created_count > 0 || result.skipped_count > 0) {
        console.log('Recurring generator run', result);
      }
    } catch (error) {
      console.error('Recurring generator failed', error);
    }
  };

  run();
  setInterval(run, Math.max(intervalMinutes, 1) * 60 * 1000);
};

const bootstrap = async () => {
  await ensurePhase2Schema();
  await ensureAttachmentsSchema();
  await ensureDevUser();

  app.listen(port, () => {
    console.log(`Flussio backend running on port ${port}`);
    startRecurringScheduler();
  });
};

bootstrap();
