import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryMigrations } from '../../apps/api-next/src/modules/library/index.ts';
import type {
  LibraryApi,
  LibraryCommands,
  LibraryQueries
} from '../../apps/api-next/src/modules/library/public/library.api.ts';
import { MigrationRegistry } from '../../apps/api-next/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api-next/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api-next/src/platform/database/sqlite-database.ts';

function migrateLibrary(): SqliteDatabase {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('library', libraryMigrations);
  runRegisteredMigrations(database, registry);
  return database;
}

function listTables(database: SqliteDatabase): string[] {
  return (
    database.connection
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function assertType<T>(_value: T): void {}

const unimplemented = async (): Promise<never> => {
  throw new Error('not implemented');
};

test('library migration creates only library-owned tables', (context) => {
  const database = migrateLibrary();
  context.after(() => database.close());

  assert.deepEqual(
    listTables(database).filter((name) => !name.startsWith('platform_')),
    ['library_chapters', 'library_command_receipts', 'library_novels', 'library_outbox']
  );
});

test('library public API exposes commands and queries without infrastructure types', () => {
  const fakeCommands = {
    reconcileAnalysis: unimplemented,
    saveChapterContent: unimplemented,
    setIngestionState: unimplemented,
    deleteNovel: unimplemented
  } satisfies LibraryCommands;
  const fakeQueries = {
    listNovels: unimplemented,
    getNovel: unimplemented,
    getChapter: unimplemented,
    getStats: unimplemented
  } satisfies LibraryQueries;

  assertType<LibraryApi>({ commands: fakeCommands, queries: fakeQueries });
  assert.deepEqual(Object.keys(fakeCommands).sort(), [
    'deleteNovel',
    'reconcileAnalysis',
    'saveChapterContent',
    'setIngestionState'
  ]);
});
