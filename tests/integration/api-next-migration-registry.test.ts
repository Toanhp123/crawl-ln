import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { ModuleMigration } from '../../apps/api-next/src/platform/database/module-migration.ts';
import { MigrationRegistry } from '../../apps/api-next/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api-next/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api-next/src/platform/database/sqlite-database.ts';

function applied(database: SqliteDatabase): Array<[string, number]> {
  return (
    database.connection
      .prepare(
        `SELECT module_name, version
           FROM platform_module_migrations
          ORDER BY module_name, version`
      )
      .all() as Array<{ module_name: string; version: number }>
  ).map((row) => [row.module_name, Number(row.version)]);
}

function tableExists(database: SqliteDatabase, name: string): boolean {
  return Boolean(
    database.connection
      .prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name=?")
      .get(name)
  );
}

test('registered module migrations run once in deterministic order', (context) => {
  const database = new SqliteDatabase(':memory:');
  context.after(() => database.close());
  const registry = new MigrationRegistry();
  let executionCount = 0;
  const migration = (module: string, version: number): ModuleMigration => ({
    module,
    version,
    up(connection: DatabaseSync) {
      executionCount += 1;
      connection.exec(`CREATE TABLE ${module}_${version}(id TEXT);`);
    }
  });

  registry.register('library', [migration('library', 2), migration('library', 1)]);
  registry.register('ingestion', [migration('ingestion', 1)]);
  runRegisteredMigrations(database, registry);
  assert.deepEqual(applied(database), [
    ['ingestion', 1],
    ['library', 1],
    ['library', 2]
  ]);

  runRegisteredMigrations(database, registry);
  assert.equal(executionCount, 3);
});

test('failed module migration rolls back its schema record and SQL', (context) => {
  const database = new SqliteDatabase(':memory:');
  context.after(() => database.close());
  const registry = new MigrationRegistry();
  registry.register('library', [
    {
      module: 'library',
      version: 1,
      up(connection) {
        connection.exec('CREATE TABLE library_temp(id TEXT);');
        throw new Error('stop');
      }
    }
  ]);

  assert.throws(() => runRegisteredMigrations(database, registry), /stop/);
  assert.equal(tableExists(database, 'library_temp'), false);
  assert.deepEqual(applied(database), []);
});

test('registry rejects duplicate and mismatched module migrations', () => {
  const registry = new MigrationRegistry();
  const migration: ModuleMigration = { module: 'library', version: 1, up() {} };
  registry.register('library', [migration]);

  assert.throws(() => registry.register('library', [migration]), /duplicate/i);
  assert.throws(() => registry.register('ingestion', [{ ...migration, version: 2 }]), /module/i);
});
