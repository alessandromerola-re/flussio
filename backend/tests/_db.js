import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../src/db/migrate.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const schemaPath = path.resolve(process.cwd(), '../database/init/001_schema.sql');

export const query = async (text, params = []) => pool.query(text, params);

export const resetDb = async ({ modules = false } = {}) => {
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const client = await pool.connect();

  try {
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query(schemaSql);
  } finally {
    client.release();
  }
  if (modules) await runMigrations();
};

// Explicit fixture for companies carried forward from the preparatory release.
// Production defaults remain Base-only; never reinstall the removed trigger.
export const seedLegacyModules = async companyId => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const company = await client.query('SELECT modules_version FROM companies WHERE id=$1 FOR UPDATE', [companyId]);
    const inserted = await client.query(`INSERT INTO company_modules(company_id,module_code,state)
      VALUES ($1,'jobs','enabled'),($1,'real_estate','enabled') ON CONFLICT DO NOTHING RETURNING module_code`, [companyId]);
    if (inserted.rowCount) {
      const version = (BigInt(company.rows[0].modules_version) + 1n).toString(), operation = randomUUID();
      for (const row of inserted.rows) {
        await client.query(`INSERT INTO company_module_events(operation_id,company_id,module_code,previous_state,new_state,reason,company_version)
          VALUES ($1,$2,$3,NULL,'enabled','legacy_compatibility',$4)`, [operation,companyId,row.module_code,version]);
      }
      await client.query('UPDATE companies SET modules_version=$2 WHERE id=$1', [companyId,version]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
};

export const close = async () => {
  await pool.end();
};
