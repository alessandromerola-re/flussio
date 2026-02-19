BEGIN;

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
);

CREATE TABLE IF NOT EXISTS recurring_runs (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  cycle_key TEXT NOT NULL,
  run_at TIMESTAMP NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('auto', 'manual')),
  generated_movement_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, cycle_key)
);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS recurring_template_id INTEGER REFERENCES recurring_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_templates_due
  ON recurring_templates(is_active, next_run_at);

CREATE INDEX IF NOT EXISTS idx_recurring_runs_template_cycle
  ON recurring_runs(template_id, cycle_key);

COMMIT;
