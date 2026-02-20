CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spec_json JSONB NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_company ON saved_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_company_shared ON saved_reports(company_id, is_shared);
CREATE INDEX IF NOT EXISTS idx_saved_reports_company_created_by ON saved_reports(company_id, created_by_user_id);
