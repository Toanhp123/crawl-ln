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
import {
  createTableSnapshot,
  exportSqliteTables,
  type SqliteModuleSnapshot
} from '../backup/sqlite-table-snapshot.js';
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

function rows(database: DatabaseSync, query: string): Array<Record<string, unknown>> {
  return database.prepare(query).all() as Array<Record<string, unknown>>;
}

function librarySnapshot(source: DatabaseSync): SqliteModuleSnapshot {
  const novels = rows(source, 'SELECT * FROM novels ORDER BY id');
  const timestamps = new Map(
    novels.map((novel) => [
      String(novel.id),
      { createdAt: String(novel.created_at), updatedAt: String(novel.updated_at) }
    ])
  );
  const chapters = rows(source, 'SELECT * FROM chapters ORDER BY novel_id, chapter_index, id').map(
    (chapter) => {
      const novel = timestamps.get(String(chapter.novel_id));
      return {
        ...chapter,
        created_at: novel?.createdAt ?? '1970-01-01T00:00:00.000Z',
        updated_at: novel?.updatedAt ?? '1970-01-01T00:00:00.000Z'
      };
    }
  );
  return {
    formatVersion: 1,
    tables: [
      createTableSnapshot(
        'library_novels',
        [
          'id',
          'title',
          'source_url',
          'source_name',
          'author',
          'cover_url',
          'status',
          'created_at',
          'updated_at'
        ],
        novels
      ),
      createTableSnapshot(
        'library_chapters',
        [
          'id',
          'novel_id',
          'chapter_index',
          'title',
          'source_url',
          'raw_text',
          'clean_text',
          'status',
          'error_message',
          'source_available',
          'content_version',
          'created_at',
          'updated_at'
        ],
        chapters
      )
    ]
  };
}

function ingestionSnapshot(source: DatabaseSync): SqliteModuleSnapshot {
  const chapters = new Map(
    rows(source, 'SELECT id, status, error_message FROM chapters').map((chapter) => [
      String(chapter.id),
      chapter
    ])
  );
  const jobs = rows(source, 'SELECT * FROM crawl_tasks ORDER BY created_at, id');
  const jobChapters: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    let chapterIds: unknown[] = [];
    try {
      chapterIds = JSON.parse(String(job.chapter_ids_json ?? '[]')) as unknown[];
    } catch {
      chapterIds = [];
    }
    chapterIds.forEach((chapterId, position) => {
      const chapter = chapters.get(String(chapterId));
      const status = ['fetched', 'failed'].includes(String(chapter?.status))
        ? String(chapter?.status)
        : 'pending';
      jobChapters.push({
        job_id: job.id,
        chapter_id: String(chapterId),
        position,
        status,
        attempt_count: status === 'pending' ? 0 : 1,
        error_message: chapter?.error_message ?? null,
        updated_at: job.updated_at
      });
    });
  }
  return {
    formatVersion: 1,
    tables: [
      createTableSnapshot(
        'ingestion_jobs',
        [
          'id',
          'novel_id',
          'status',
          'outcome',
          'total_chapters',
          'fetched_chapters',
          'failed_chapters',
          'error_message',
          'started_at',
          'finished_at',
          'paused_at',
          'total_paused_ms',
          'current_speed',
          'average_speed',
          'eta_seconds',
          'created_at',
          'updated_at'
        ],
        jobs
      ),
      createTableSnapshot(
        'ingestion_job_chapters',
        [
          'job_id',
          'chapter_id',
          'position',
          'status',
          'attempt_count',
          'error_message',
          'updated_at'
        ],
        jobChapters
      ),
      createTableSnapshot(
        'ingestion_events',
        [
          'id',
          'job_id',
          'type',
          'level',
          'message',
          'chapter_id',
          'chapter_index',
          'chapter_title',
          'attempt',
          'created_at'
        ],
        rows(source, 'SELECT * FROM crawl_events ORDER BY created_at, id').map((event) => ({
          ...event,
          job_id: event.task_id
        }))
      )
    ]
  };
}

function schedulerSnapshot(source: DatabaseSync): SqliteModuleSnapshot {
  const policies = rows(source, 'SELECT * FROM novels ORDER BY id').map((novel) => ({
    novel_id: novel.id,
    enabled: novel.auto_update_enabled,
    interval_minutes: novel.update_interval_minutes,
    last_check_at: novel.last_update_check_at,
    next_check_at: novel.next_update_check_at,
    last_result: novel.last_update_result,
    consecutive_failures: novel.consecutive_update_failures,
    created_at: novel.created_at,
    updated_at: novel.updated_at
  }));
  return {
    formatVersion: 1,
    tables: [
      createTableSnapshot(
        'scheduler_policies',
        [
          'novel_id',
          'enabled',
          'interval_minutes',
          'last_check_at',
          'next_check_at',
          'last_result',
          'consecutive_failures',
          'created_at',
          'updated_at'
        ],
        policies
      ),
      createTableSnapshot(
        'scheduler_diagnostics',
        [
          'id',
          'novel_id',
          'source_name',
          'result',
          'message',
          'new_chapter_count',
          'pending_chapter_count',
          'duration_ms',
          'created_at'
        ],
        rows(source, 'SELECT * FROM novel_update_diagnostics ORDER BY created_at, id')
      )
    ]
  };
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
    await new LibraryBackupContributor(candidate).importMergeData(librarySnapshot(source), context);
    await new IngestionBackupContributor(candidate).importMergeData(
      ingestionSnapshot(source),
      context
    );
    await new SchedulerBackupContributor(candidate).importMergeData(
      schedulerSnapshot(source),
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
