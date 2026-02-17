CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense')),
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  default_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE properties (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT,
  notes TEXT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  budget NUMERIC(12, 2),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE recurring_templates (
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
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount_total NUMERIC(12, 2) NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  recurring_template_id INTEGER REFERENCES recurring_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE transaction_accounts (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(12, 2) NOT NULL
);

CREATE TABLE attachments (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);



CREATE TABLE recurring_runs (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  cycle_key TEXT NOT NULL,
  run_at TIMESTAMP NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('auto', 'manual')),
  generated_movement_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, cycle_key)
);

CREATE INDEX idx_accounts_company ON accounts(company_id);
CREATE INDEX idx_categories_company ON categories(company_id);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_properties_company ON properties(company_id);
CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_active ON jobs(company_id, is_active);
CREATE INDEX idx_jobs_company_active ON jobs(company_id, is_active, is_closed);
CREATE UNIQUE INDEX idx_jobs_company_code_unique ON jobs(company_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_transactions_company ON transactions(company_id);
CREATE INDEX idx_transactions_job ON transactions(company_id, job_id);
CREATE INDEX idx_transactions_company_job_date ON transactions(company_id, job_id, date);
CREATE INDEX idx_transaction_accounts_transaction ON transaction_accounts(transaction_id);
CREATE INDEX idx_recurring_templates_due ON recurring_templates(is_active, next_run_at);
CREATE INDEX idx_recurring_runs_template_cycle ON recurring_runs(template_id, cycle_key);
