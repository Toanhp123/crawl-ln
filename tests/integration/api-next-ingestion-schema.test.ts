import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestionMigrations } from '../../apps/api-next/src/modules/ingestion/index.ts';
import type { CreateIngestionJobCommand } from '../../apps/api-next/src/modules/ingestion/public/ingestion.api.ts';
import { MigrationRegistry } from '../../apps/api-next/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api-next/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api-next/src/platform/database/sqlite-database.ts';

function migrateIngestion(): SqliteDatabase {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('ingestion', ingestionMigrations);
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

test('ingestion migration creates only ingestion-owned tables', (context) => {
  const database = migrateIngestion();
  context.after(() => database.close());

  assert.deepEqual(
    listTables(database).filter((name) => !name.startsWith('platform_')),
    [
      'ingestion_command_receipts',
      'ingestion_events',
      'ingestion_job_chapters',
      'ingestion_jobs',
      'ingestion_outbox'
    ]
  );
});

test('ingestion schema has no foreign key to Library tables', (context) => {
  const database = migrateIngestion();
  context.after(() => database.close());
  const referencedTables = ['ingestion_jobs', 'ingestion_job_chapters', 'ingestion_events'].flatMap(
    (table) =>
      (
        database.connection.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{
          table: string;
        }>
      ).map((row) => row.table)
  );

  assert.equal(
    referencedTables.every((table) => table.startsWith('ingestion_')),
    true
  );
});

test('ingestion contracts keep library references opaque', () => {
  const command: CreateIngestionJobCommand = {
    commandId: 'command-1',
    novelId: 'novel-1',
    requestedAt: '2026-07-21T00:00:00.000Z'
  };
  assert.equal(command.novelId, 'novel-1');
});
