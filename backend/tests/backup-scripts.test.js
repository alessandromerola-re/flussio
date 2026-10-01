import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const scripts = path.resolve(import.meta.dirname, '../../deploy/production');
async function fixture(work) {
  const dir = await mkdtemp(path.join(tmpdir(), 'flussio-backup-test-'));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, FLUSSIO_COMPOSE_FILE: path.join(dir, 'compose.yml'), TEST_LOG: path.join(dir, 'calls.log') };
  await writeFile(env.FLUSSIO_COMPOSE_FILE, 'services: {}');
  await writeFile(path.join(dir, 'docker-compose'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$TEST_LOG"
case "$*" in
 *pg_dump*) printf 'CREATE TABLE users(id int);\\n'; exit "\${DUMP_EXIT:-0}" ;;
 *createdb*) exit "\${CREATE_EXIT:-0}" ;;
 *dropdb*) exit 0 ;;
 *psql*) if [[ "$*" != *ON_ERROR_STOP=1* ]]; then exit 88; fi
          if [[ "$*" == *single-transaction* ]]; then cat >/dev/null; exit "\${RESTORE_EXIT:-0}"; fi ;;
esac
`, { mode: 0o755 });
  try { await work(dir, env); } finally { await rm(dir, { recursive: true, force: true }); }
}
const run = (script, file, env) => spawnSync('bash', [path.join(scripts, script), file], { env, encoding: 'utf8' });

test('backup propagates pg_dump failure, removes partial output and never overwrites an existing backup', async () => fixture(async (dir, env) => {
  const file = path.join(dir, 'backup.sql.gz');
  assert.notEqual(run('backup.sh', file, { ...env, DUMP_EXIT: '1' }).status, 0);
  assert.equal((await readdir(dir)).some(name => name.startsWith('backup.sql.gz')), false);
  assert.equal(run('backup.sh', file, env).status, 0);
  const before = await readFile(file);
  assert.notEqual(run('backup.sh', file, env).status, 0);
  assert.deepEqual(await readFile(file), before);
}));
test('restore rejects SQL failure, cleans only its newly created database and cannot report success', async () => fixture(async (dir, env) => {
  const file = path.join(dir, 'backup.sql.gz'); await writeFile(file, gzipSync('INVALID SQL;'));
  const result = run('restore-test.sh', file, { ...env, RESTORE_EXIT: '3' });
  assert.notEqual(result.status, 0); assert.doesNotMatch(result.stdout, /test passed/);
  const calls = await readFile(env.TEST_LOG, 'utf8'); assert.match(calls, /dropdb/); assert.match(calls, /--single-transaction/);
  const targets = [...calls.matchAll(/sh (flussio_restore_test_\d+_\d+)/g)].map(match => match[1]);
  assert.equal(new Set(targets).size, 1);
}));
test('restore never drops a database if createdb fails and successful restores clean up first', async () => fixture(async (dir, env) => {
  const file = path.join(dir, 'backup.sql.gz'); await writeFile(file, gzipSync('CREATE TABLE users(id int);'));
  assert.notEqual(run('restore-test.sh', file, { ...env, CREATE_EXIT: '1' }).status, 0);
  assert.doesNotMatch(await readFile(env.TEST_LOG, 'utf8'), /dropdb|psql/);
  await writeFile(env.TEST_LOG, '');
  const result = run('restore-test.sh', file, env); assert.equal(result.status, 0); assert.match(result.stdout, /test passed/);
  assert.match((await readFile(env.TEST_LOG, 'utf8')).trim().split('\n').at(-1), /dropdb/);
}));
