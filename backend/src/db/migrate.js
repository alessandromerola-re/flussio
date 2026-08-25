import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getClient } from './index.js';

const DEFAULT_MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const BASELINE_MANIFEST_FILE = 'baseline-manifest.json';

const TRACKING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  note TEXT
)
`;

const LEGACY_EXPECTED_TABLES = [
  'companies',
  'users',
  'user_companies',
  'accounts',
  'categories',
  'contacts',
  'properties',
  'jobs',
  'transactions',
  'transaction_accounts',
  'attachments',
  'recurring_templates',
  'recurring_runs',
  'audit_log',
  'password_reset_tokens',
  'contracts',
];

const EXPECTED_TABLES = [...LEGACY_EXPECTED_TABLES, 'saved_reports'];

const LEGACY_EXPECTED_COLUMNS = [
  ['users', 'is_super_admin'],
  ['users', 'is_active'],
  ['users', 'role'],
  ['jobs', 'title'],
  ['jobs', 'code'],
  ['jobs', 'expected_revenue_cents'],
  ['jobs', 'expected_cost_cents'],
  ['transactions', 'job_id'],
  ['transactions', 'recurring_template_id'],
  ['attachments', 'original_name'],
  ['attachments', 'storage_path'],
  ['accounts', 'opening_balance'],
];

const EXPECTED_COLUMNS = [...LEGACY_EXPECTED_COLUMNS, ['recurring_templates', 'account_id']];

const advisoryLockKey = 74201931;

const checksumOf = (content) => crypto.createHash('sha256').update(content).digest('hex');

export const stripOuterTransaction = (sql) => {
  const match = sql.match(/^\s*BEGIN\s*;([\s\S]*)COMMIT\s*;\s*$/i);
  return match ? match[1].trim() : sql;
};

const listMigrationFiles = async (migrationsDir) => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const readBaselineManifest = async (migrationsDir, migrationFiles) => {
  const manifestPath = path.join(migrationsDir, BASELINE_MANIFEST_FILE);
  let manifest;

  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Baseline manifest not found (${manifestPath}).`);
    }
    throw new Error(`Invalid baseline manifest (${manifestPath}): ${error.message}`);
  }

  const foldedMigrations = manifest?.folded_migrations;
  const legacyAdoptedMigrations = manifest?.legacy_adopted_migrations;
  if (
    typeof manifest?.baseline !== 'string'
    || !Array.isArray(foldedMigrations)
    || !Array.isArray(legacyAdoptedMigrations)
  ) {
    throw new Error('Baseline manifest must define baseline, folded_migrations and legacy_adopted_migrations.');
  }

  const knownFiles = new Set(migrationFiles);
  const declaredFiles = [manifest.baseline, ...foldedMigrations, ...legacyAdoptedMigrations];
  const missingFiles = [...new Set(declaredFiles.filter((filename) => !knownFiles.has(filename)))];
  if (missingFiles.length > 0) {
    throw new Error(`Baseline manifest references missing migrations: ${missingFiles.join(', ')}.`);
  }

  if (foldedMigrations.includes(manifest.baseline)) {
    throw new Error('Baseline migration must not also appear in folded_migrations.');
  }

  if (new Set(foldedMigrations).size !== foldedMigrations.length
      || new Set(legacyAdoptedMigrations).size !== legacyAdoptedMigrations.length) {
    throw new Error('Baseline manifest contains duplicate migration filenames.');
  }

  return {
    baseline: manifest.baseline,
    foldedMigrations,
    legacyAdoptedMigrations,
  };
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
    await client.query(stripOuterTransaction(sql));
    await markAsApplied(client, migration, 'executed');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Migration failed (${migration.filename}): ${error.message}`);
  }
};

const verifySchemaCompleteness = async (
  client,
  expectedTables = EXPECTED_TABLES,
  expectedColumns = EXPECTED_COLUMNS
) => {
  const missingTables = [];
  for (const tableName of expectedTables) {
    const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
    if (!result.rows[0]?.exists) {
      missingTables.push(tableName);
    }
  }

  const missingColumns = [];
  for (const [tableName, columnName] of expectedColumns) {
    const result = await client.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists`,
      [tableName, columnName]
    );
    if (!result.rows[0]?.exists) {
      missingColumns.push(`${tableName}.${columnName}`);
    }
  }

  return { missingTables, missingColumns };
};

export const runMigrations = async ({
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  acquireClient = getClient,
} = {}) => {
  let files;
  try {
    files = await listMigrationFiles(migrationsDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Migrations directory not found (${migrationsDir}); skipping migration run.`);
      return;
    }
    throw error;
  }

  if (files.length === 0) {
    console.warn(`No SQL migrations found in ${migrationsDir}; skipping migration run.`);
    return;
  }

  const manifest = await readBaselineManifest(migrationsDir, files);

  const migrations = await Promise.all(files.map(async (filename) => {
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    return { filename, checksum: checksumOf(sql) };
  }));
  const migrationByFilename = new Map(migrations.map((migration) => [migration.filename, migration]));

  const client = await acquireClient();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey]);
    await client.query(TRACKING_TABLE_SQL);

    const hasUsersTableResult = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS has_users`);
    const hasUsersTable = hasUsersTableResult.rows[0]?.has_users === true;

    const appliedResult = await client.query('SELECT filename, checksum FROM schema_migrations');
    const appliedMap = new Map(appliedResult.rows.map((row) => [row.filename, row.checksum]));

    if (appliedMap.size === 0 && hasUsersTable) {
      const schemaCheck = await verifySchemaCompleteness(
        client,
        LEGACY_EXPECTED_TABLES,
        LEGACY_EXPECTED_COLUMNS
      );
      if (schemaCheck.missingTables.length > 0 || schemaCheck.missingColumns.length > 0) {
        throw new Error(
          `Legacy schema is incomplete; refusing automatic adoption. Missing tables: ${schemaCheck.missingTables.join(', ') || 'none'}. Missing columns: ${schemaCheck.missingColumns.join(', ') || 'none'}.`
        );
      }

      for (const filename of manifest.legacyAdoptedMigrations) {
        const migration = migrationByFilename.get(filename);
        await markAsApplied(client, migration, 'adopted_from_verified_legacy_installation');
        appliedMap.set(filename, migration.checksum);
      }
      console.log(`Adopted ${manifest.legacyAdoptedMigrations.length} migrations from verified legacy schema.`);
    }

    if (appliedMap.size === 0 && !hasUsersTable) {
      const baseline = migrationByFilename.get(manifest.baseline);
      if (!baseline) {
        throw new Error(`Fresh installation requires baseline migration ${manifest.baseline}.`);
      }
      await runSqlMigration(client, migrationsDir, baseline);
      appliedMap.set(baseline.filename, baseline.checksum);

      for (const filename of manifest.foldedMigrations) {
        const migration = migrationByFilename.get(filename);
        await markAsApplied(client, migration, 'folded_into_baseline');
        appliedMap.set(filename, migration.checksum);
      }
      console.log(
        `Applied baseline migration ${baseline.filename} and folded ${manifest.foldedMigrations.length} declared legacy migrations.`
      );
    }

    for (const migration of migrations) {
      const existingChecksum = appliedMap.get(migration.filename);
      if (!existingChecksum) {
        await runSqlMigration(client, migrationsDir, migration);
        appliedMap.set(migration.filename, migration.checksum);
        console.log(`Applied migration: ${migration.filename}`);
        continue;
      }

      if (existingChecksum !== migration.checksum) {
        throw new Error(`Checksum mismatch for already-applied migration ${migration.filename}.`);
      }
    }

    const schemaCheck = await verifySchemaCompleteness(client);
    if (schemaCheck.missingTables.length > 0 || schemaCheck.missingColumns.length > 0) {
      throw new Error(
        `Schema verification failed after migrations. Missing tables: ${schemaCheck.missingTables.join(', ') || 'none'}. Missing columns: ${schemaCheck.missingColumns.join(', ') || 'none'}.`
      );
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
