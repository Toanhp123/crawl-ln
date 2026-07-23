import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createCurrentDatabaseFixture } from '../helpers/current-database.fixture.ts';

test('current fixture is created by module migrations and contains retained backup data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-current-fixture-'));
  let database: DatabaseSync | undefined;
  try {
    const fixture = await createCurrentDatabaseFixture(root);
    database = new DatabaseSync(fixture.databasePath);
    assert.deepEqual(fixture.counts, { novels: 1, chapters: 1, tasks: 1, plugins: 1 });
    const migrations = database
      .prepare('SELECT module_name, version FROM platform_module_migrations ORDER BY module_name')
      .all() as any[];
    assert.deepEqual(
      migrations.map((row) => `${row.module_name}:${row.version}`),
      ['ingestion:1', 'library:1', 'scheduler:1', 'search:1', 'source-reader:1']
    );
  } finally {
    database?.close();
    await rm(root, { recursive: true, force: true });
  }
});
