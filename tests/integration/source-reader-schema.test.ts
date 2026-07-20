import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-schema-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));

test.after(() => {
  database.close();
  return rm(root, { recursive: true, force: true });
});

test('source reader owns required tables and indexes', () => {
  const tables = database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'source_reader_%'")
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
  assert.deepEqual(tables, [
    'source_reader_auth_challenges',
    'source_reader_cache_entries',
    'source_reader_cache_tags',
    'source_reader_credentials',
    'source_reader_health_checks',
    'source_reader_installations',
    'source_reader_network_profiles',
    'source_reader_plugin_permissions',
    'source_reader_plugin_versions',
    'source_reader_plugins',
    'source_reader_sessions'
  ]);
});
