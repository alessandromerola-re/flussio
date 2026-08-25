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

  const migrationResult = await query(
    `SELECT filename, note
     FROM schema_migrations
     WHERE filename IN (
       '000_20260327__baseline_full_schema.sql',
       '006_20260220__saved_reports.sql',
       '010_20260825__repair_saved_reports.sql',
       '011_20260825__recurring_template_account.sql'
     )
     ORDER BY filename`
  );

  assert.deepEqual(migrationResult.rows, [
    { filename: '000_20260327__baseline_full_schema.sql', note: 'executed' },
    { filename: '006_20260220__saved_reports.sql', note: 'executed' },
    { filename: '010_20260825__repair_saved_reports.sql', note: 'executed' },
    { filename: '011_20260825__recurring_template_account.sql', note: 'executed' },
  ]);

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
