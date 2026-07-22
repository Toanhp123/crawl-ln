import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { IngestionBackupContributor } from '../../modules/ingestion/infrastructure/backup/ingestion-backup.contributor.js';
import { ingestionMigrations } from '../../modules/ingestion/index.js';
import { LibraryBackupContributor } from '../../modules/library/infrastructure/backup/library-backup.contributor.js';
import { libraryMigrations } from '../../modules/library/index.js';
import { createLibraryModule } from '../../modules/library/library.module.js';
import { SchedulerBackupContributor } from '../../modules/scheduler/infrastructure/backup/scheduler-backup.contributor.js';
import { schedulerMigrations } from '../../modules/scheduler/index.js';
import { searchMigrations } from '../../modules/search/index.js';
import { createSearchModule } from '../../modules/search/search.module.js';
import {
  SourceReaderBackupContributor,
  sourceReaderBackupTables
} from '../../modules/source-reader/infrastructure/backup/source-reader-backup.contributor.js';
import { sourceReaderMigrations } from '../../modules/source-reader/index.js';
import { exportSqliteTables } from '../backup/sqlite-table-snapshot.js';
import { MigrationRegistry } from '../database/migration-registry.js';
import { runRegisteredMigrations } from '../database/migration-runner.js';
import { SqliteDatabase } from '../database/sqlite-database.js';
import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import {
  assertValidV22Source,
  validateV22Import,
  V22ImportValidationError,
  type V22ImportValidation
} from './v22-validation.js';
import {
  createV22IngestionSnapshot,
  createV22LibrarySnapshot,
  createV22SchedulerSnapshot
} from './v22-module-snapshots.js';

export interface V22ImportReport {
  valid: true;
  sourcePath: string;
  targetPath: string;
  sourceSchemaVersion: 22;
  targetSchemaVersion: 1;
  sourceDatabaseSha256: string;
  targetDatabaseSha256: string;
  ids: { novelId: string; chapterId: string; taskId: string; pluginId: string };
  counts: { novels: number; chapters: number; tasks: number; plugins: number };
  validation: V22ImportValidation;
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function firstId(database: DatabaseSync, table: string, column = 'id'): string {
  const row = database
    .prepare(`SELECT ${column} AS id FROM ${table} ORDER BY ${column} LIMIT 1`)
    .get() as { id?: string } | undefined;
  return String(row?.id ?? '');
}

function count(database: DatabaseSync, table: string): number {
  return Number(
    (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
  );
}

function registerTargetMigrations(database: SqliteDatabase): void {
  const registry = new MigrationRegistry();
  registry.register('library', libraryMigrations);
  registry.register('ingestion', ingestionMigrations);
  registry.register('scheduler', schedulerMigrations);
  registry.register('search', searchMigrations);
  registry.register('source-reader', sourceReaderMigrations);
  runRegisteredMigrations(database, registry);
}

async function promote(stagingPath: string, targetPath: string): Promise<void> {
  const backupPath = `${targetPath}.previous-${randomUUID()}`;
  const hadTarget = existsSync(targetPath);
  if (hadTarget) await rename(targetPath, backupPath);
  try {
    await rename(stagingPath, targetPath);
    if (hadTarget) await rm(backupPath, { force: true });
  } catch (error) {
    if (hadTarget && existsSync(backupPath)) await rename(backupPath, targetPath);
    throw error;
  }
}

export async function importV22Database(input: {
  sourcePath: string;
  targetPath: string;
}): Promise<V22ImportReport> {
  const sourcePath = resolve(input.sourcePath);
  const targetPath = resolve(input.targetPath);
  if (sourcePath === targetPath) {
    throw new V22ImportValidationError('V22 import validation failed: source and target match');
  }
  const sourceContent = await readFile(sourcePath);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const stagingPath = `${targetPath}.import-${randomUUID()}`;
  let candidate: SqliteDatabase | undefined;

  try {
    const sourceSchemaVersion = assertValidV22Source(source);
    await mkdir(dirname(targetPath), { recursive: true });
    candidate = new SqliteDatabase(stagingPath);
    registerTargetMigrations(candidate);
    const context = { importId: `v22:${randomUUID()}` };
    await new LibraryBackupContributor(candidate).importMergeData(
      createV22LibrarySnapshot(source),
      context
    );
    await new IngestionBackupContributor(candidate).importMergeData(
      createV22IngestionSnapshot(source),
      context
    );
    await new SchedulerBackupContributor(candidate).importMergeData(
      createV22SchedulerSnapshot(source),
      context
    );
    await new SourceReaderBackupContributor(candidate).importMergeData(
      exportSqliteTables(source, sourceReaderBackupTables),
      context
    );
    const library = createLibraryModule(candidate);
    const search = createSearchModule({
      database: candidate,
      library: library.api.queries,
      events: new InMemoryEventBus(),
      clock: { now: () => new Date() }
    });
    await search.api.commands.rebuild();
    const validation = validateV22Import(source, candidate.connection);
    if (validation.errors.length > 0) {
      throw new V22ImportValidationError(
        `V22 import validation failed: ${validation.errors.join('; ')}`,
        validation
      );
    }
    const ids = {
      novelId: firstId(source, 'novels'),
      chapterId: firstId(source, 'chapters'),
      taskId: firstId(source, 'crawl_tasks'),
      pluginId: firstId(source, 'source_reader_plugins')
    };
    const counts = {
      novels: count(source, 'novels'),
      chapters: count(source, 'chapters'),
      tasks: count(source, 'crawl_tasks'),
      plugins: count(source, 'source_reader_plugins')
    };
    candidate.close();
    candidate = undefined;
    const targetDatabaseSha256 = sha256(await readFile(stagingPath));
    await promote(stagingPath, targetPath);
    return {
      valid: true,
      sourcePath,
      targetPath,
      sourceSchemaVersion: sourceSchemaVersion as 22,
      targetSchemaVersion: 1,
      sourceDatabaseSha256: sha256(sourceContent),
      targetDatabaseSha256,
      ids,
      counts,
      validation
    };
  } finally {
    candidate?.close();
    source.close();
    await rm(stagingPath, { force: true });
    await rm(`${stagingPath}-wal`, { force: true });
    await rm(`${stagingPath}-shm`, { force: true });
  }
}
