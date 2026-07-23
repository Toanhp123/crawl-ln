import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/index.ts';

test('non-empty database without current migration ledger is rejected without mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-db-compat-'));
  const database = new SqliteDatabase(join(root, 'old.sqlite'));
  try {
    database.connection.exec(
      "CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES(22); CREATE TABLE old_data(value TEXT); INSERT INTO old_data VALUES('keep');"
    );
    const registry = new MigrationRegistry();
    registry.register('library', libraryMigrations);
    assert.throws(() => runRegisteredMigrations(database, registry), /npm run clean -- --data/);
    assert.equal(
      (database.connection.prepare('SELECT value FROM old_data').get() as any).value,
      'keep'
    );
    const ledger = database.connection
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name='platform_module_migrations'"
      )
      .get();
    assert.equal(ledger, undefined);
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('empty database initializes through current module migrations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-db-current-'));
  const database = new SqliteDatabase(join(root, 'current.sqlite'));
  try {
    const registry = new MigrationRegistry();
    registry.register('library', libraryMigrations);
    runRegisteredMigrations(database, registry);
    assert.ok(
      database.connection
        .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='library_novels'")
        .get()
    );
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
