import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getClient } from './index.js';

const DEFAULT_MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

const TRACKING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  note TEXT
)
`;

const advisoryLockKey = 74201931;

const checksumOf = (content) => crypto.createHash('sha256').update(content).digest('hex');

const listMigrationFiles = async (migrationsDir) => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const markAsApplied = async (client, migration, note) => {
  await client.query(
    `INSERT INTO schema_migrations (filename, checksum, note)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum`,
    [migration.filename, migration.checksum, note]
  );
};

const runSqlMigration = async (client, migrationsDir, migration) => {
  const sql = await fs.readFile(path.join(migrationsDir, migration.filename), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await markAsApplied(client, migration, 'executed');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Migration failed (${migration.filename}): ${error.message}`);
  }
};

export const runMigrations = async () => {
  let files;
  try {
    files = await listMigrationFiles(DEFAULT_MIGRATIONS_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Migrations directory not found (${DEFAULT_MIGRATIONS_DIR}); skipping migration run.`);
      return;
    }
    throw error;
  }

  if (files.length === 0) {
    console.warn(`No SQL migrations found in ${DEFAULT_MIGRATIONS_DIR}; skipping migration run.`);
    return;
  }

  const migrations = await Promise.all(files.map(async (filename) => {
    const sql = await fs.readFile(path.join(DEFAULT_MIGRATIONS_DIR, filename), 'utf8');
    return { filename, checksum: checksumOf(sql) };
  }));

  const client = await getClient();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey]);
    await client.query(TRACKING_TABLE_SQL);

    const hasLegacySchemaResult = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS has_users`);
    const hasLegacySchema = hasLegacySchemaResult.rows[0]?.has_users === true;

    const appliedResult = await client.query('SELECT filename, checksum FROM schema_migrations');
    const appliedMap = new Map(appliedResult.rows.map((row) => [row.filename, row.checksum]));

    if (appliedMap.size === 0 && hasLegacySchema) {
      for (const migration of migrations) {
        await markAsApplied(client, migration, 'adopted_from_legacy_installation');
      }
      console.log(`Adopted ${migrations.length} migrations from legacy schema.`);
      return;
    }

    if (appliedMap.size === 0 && !hasLegacySchema) {
      const baseline = migrations.find((migration) => migration.filename.startsWith('000_'));
      if (!baseline) {
        throw new Error('Fresh installation requires a baseline migration starting with 000_.');
      }
      await runSqlMigration(client, DEFAULT_MIGRATIONS_DIR, baseline);

      const folded = migrations.filter((migration) => migration.filename !== baseline.filename);
      for (const migration of folded) {
        await markAsApplied(client, migration, 'folded_into_baseline');
      }
      console.log(`Applied baseline migration ${baseline.filename} and folded ${folded.length} legacy migrations.`);
      return;
    }

    for (const migration of migrations) {
      const existingChecksum = appliedMap.get(migration.filename);
      if (!existingChecksum) {
        await runSqlMigration(client, DEFAULT_MIGRATIONS_DIR, migration);
        console.log(`Applied migration: ${migration.filename}`);
        continue;
      }

      if (existingChecksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for already-applied migration ${migration.filename}.`);
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockKey]);
    } catch {
      // noop
    }
    client.release();
  }
};
