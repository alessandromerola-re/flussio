import test from 'node:test';
import assert from 'node:assert/strict';
import { query, close } from './_db.js';
import { runMigrations, stripOuterTransaction } from '../src/db/migrate.js';

const resetSchema = async () => {
  await query('DROP SCHEMA public CASCADE;');
  await query('CREATE SCHEMA public;');
};

test.after(async () => {
  await close();
});

test('stripOuterTransaction lets the runner own the migration transaction', () => {
  assert.equal(
    stripOuterTransaction('BEGIN;\nCREATE TABLE example (id INTEGER);\nCOMMIT;\n'),
    'CREATE TABLE example (id INTEGER);'
  );
  assert.equal(
    stripOuterTransaction('CREATE TABLE example (id INTEGER);'),
    'CREATE TABLE example (id INTEGER);'
  );
});

test('fresh installation executes migrations not declared as folded', async () => {
  await resetSchema();
  await runMigrations();

  const tableResult = await query("SELECT to_regclass('public.saved_reports') AS table_name");
  assert.equal(tableResult.rows[0].table_name, 'saved_reports');
  const authSessionsResult = await query("SELECT to_regclass('public.auth_sessions') AS table_name");
  assert.equal(authSessionsResult.rows[0].table_name, 'auth_sessions');
  const addressColumn = await query("SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name='address'");
  assert.equal(addressColumn.rows[0]?.column_name, 'address');

  const migrationResult = await query(
    `SELECT filename, note
     FROM schema_migrations
     WHERE filename IN (
       '000_20260327__baseline_full_schema.sql',
       '006_20260220__saved_reports.sql',
       '010_20260825__repair_saved_reports.sql',
       '011_20260825__recurring_template_account.sql',
       '012_20260825__auth_sessions.sql',
       '012_20260831__prepare_property_codes.sql',
       '013_20260831__property_codes.sql',
       '014_20260831__collision_safe_property_codes.sql'
     )
     ORDER BY filename`
  );

  assert.deepEqual(migrationResult.rows, [
    { filename: '000_20260327__baseline_full_schema.sql', note: 'executed' },
    { filename: '006_20260220__saved_reports.sql', note: 'executed' },
    { filename: '010_20260825__repair_saved_reports.sql', note: 'executed' },
    { filename: '011_20260825__recurring_template_account.sql', note: 'executed' },
    { filename: '012_20260825__auth_sessions.sql', note: 'executed' },
    { filename: '012_20260831__prepare_property_codes.sql', note: 'executed' },
    { filename: '013_20260831__property_codes.sql', note: 'executed' },
    { filename: '014_20260831__collision_safe_property_codes.sql', note: 'executed' },
  ]);

  await query("INSERT INTO companies (name) VALUES ('Property code test')");
  const propertyResult = await query(
    `INSERT INTO properties (company_id, name)
     VALUES ((SELECT id FROM companies WHERE name = 'Property code test'), 'Immobile test')
     RETURNING external_id`
  );
  assert.match(propertyResult.rows[0].external_id, /^IMM-\d{6}$/);

  const foldedResult = await query(
    `SELECT note
     FROM schema_migrations
     WHERE filename = '009_20260324__jobs_expected_revenue_cost_cents.sql'`
  );
  assert.equal(foldedResult.rows[0].note, 'folded_into_baseline');
});

test('repair migration restores saved_reports on an affected v1.2.0 schema', async () => {
  await resetSchema();
  await runMigrations();
  await query('DROP TABLE saved_reports;');
  await query("DELETE FROM schema_migrations WHERE filename = '010_20260825__repair_saved_reports.sql'");

  await runMigrations();

  const tableResult = await query("SELECT to_regclass('public.saved_reports') AS table_name");
  assert.equal(tableResult.rows[0].table_name, 'saved_reports');

  const repairResult = await query(
    `SELECT note
     FROM schema_migrations
     WHERE filename = '010_20260825__repair_saved_reports.sql'`
  );
  assert.equal(repairResult.rows[0].note, 'executed');
});

test('property code migrations survive occupied primary and fallback codes', async () => {
  await resetSchema();
  await runMigrations();

  await query('DROP TRIGGER IF EXISTS trg_properties_external_id ON properties');
  await query('DROP FUNCTION IF EXISTS assign_property_external_id()');
  await query('ALTER TABLE properties ALTER COLUMN external_id DROP NOT NULL');
  await query(
    `DELETE FROM schema_migrations
     WHERE filename IN (
       '012_20260831__prepare_property_codes.sql',
       '013_20260831__property_codes.sql',
       '014_20260831__collision_safe_property_codes.sql'
     )`
  );

  const companyResult = await query(
    "INSERT INTO companies (name) VALUES ('Property collision test') RETURNING id"
  );
  const companyId = companyResult.rows[0].id;
  const targetResult = await query(
    `INSERT INTO properties (company_id, name, external_id)
     VALUES ($1, 'Target senza codice', NULL)
     RETURNING id`,
    [companyId]
  );
  const targetId = targetResult.rows[0].id;
  const targetBaseCode = `IMM-${String(targetId).padStart(6, '0')}`;

  const blockerResult = await query(
    `INSERT INTO properties (company_id, name, external_id)
     VALUES
       ($1, 'Blocco codice base', $2),
       ($1, 'Blocco vecchio fallback', $3)
     RETURNING id, external_id`,
    [companyId, targetBaseCode, `IMM-AUTO-${companyId}-${targetId}`]
  );
  const baseBlockerId = blockerResult.rows.find((row) => row.external_id === targetBaseCode).id;
  const fallbackBlockerId = blockerResult.rows.find(
    (row) => row.external_id === `IMM-AUTO-${companyId}-${targetId}`
  ).id;

  await runMigrations();

  const migratedTarget = await query(
    'SELECT external_id FROM properties WHERE id = $1',
    [targetId]
  );
  assert.equal(migratedTarget.rows[0].external_id, `${targetBaseCode}-1`);

  const sequenceResult = await query('SELECT last_value FROM properties_id_seq');
  const nextId = Number(sequenceResult.rows[0].last_value) + 1;
  const nextBaseCode = `IMM-${String(nextId).padStart(6, '0')}`;
  await query(
    `UPDATE properties
     SET external_id = CASE id WHEN $2 THEN $4 ELSE $5 END
     WHERE company_id = $1 AND id IN ($2, $3)`,
    [companyId, baseBlockerId, fallbackBlockerId, nextBaseCode, `${nextBaseCode}-1`]
  );

  const generatedResult = await query(
    `INSERT INTO properties (company_id, name)
     VALUES ($1, 'Nuovo immobile con collisioni')
     RETURNING id, external_id`,
    [companyId]
  );
  assert.equal(generatedResult.rows[0].id, nextId);
  assert.equal(generatedResult.rows[0].external_id, `${nextBaseCode}-2`);
});
