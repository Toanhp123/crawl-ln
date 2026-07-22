import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ingestionBackupTables } from '../../modules/ingestion/infrastructure/backup/ingestion-backup.contributor.js';
import { schedulerBackupTables } from '../../modules/scheduler/infrastructure/backup/scheduler-backup.contributor.js';
import { sourceReaderBackupTables } from '../../modules/source-reader/infrastructure/backup/source-reader-backup.contributor.js';
import { exportSqliteTables, type SqliteModuleSnapshot } from '../backup/sqlite-table-snapshot.js';
import { createV22IngestionSnapshot, createV22SchedulerSnapshot } from './v22-module-snapshots.js';

export interface V22ImportValidation {
  idsPreserved: boolean;
  timestampsPreserved: boolean;
  recordCounts: Record<string, { source: number; candidate: number }>;
  chapterContentSha256: string;
  taskOutcomeSha256: string;
  sourceReaderMetadataSha256: string;
  schedulerPolicySha256: string;
  searchRebuilt: boolean;
  errors: string[];
}

export class V22ImportValidationError extends Error {
  constructor(
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'V22ImportValidationError';
  }
}

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return { bigint: value.toString() };
  if (value instanceof Uint8Array) return { blob: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)])
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}

function count(database: DatabaseSync, table: string): number {
  return Number(
    (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
  );
}

function ids(database: DatabaseSync, table: string, column = 'id'): string[] {
  return (
    database.prepare(`SELECT ${column} AS id FROM ${table} ORDER BY ${column}`).all() as Array<{
      id: string;
    }>
  ).map((row) => String(row.id));
}

function normalizedSnapshot(snapshot: SqliteModuleSnapshot): SqliteModuleSnapshot {
  const sorted = {
    ...snapshot,
    tables: snapshot.tables
      .map((table) => {
        const orderedColumns = table.columns
          .map((column, index) => ({ column, index }))
          .sort((left, right) => left.column.localeCompare(right.column));
        return {
          ...table,
          columns: orderedColumns.map(({ column }) => column),
          rows: table.rows
            .map((row) => orderedColumns.map(({ index }) => row[index]!))
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  };
  return sorted;
}

function snapshotHash(snapshot: SqliteModuleSnapshot): string {
  return hash(normalizedSnapshot(snapshot));
}

function sortedSnapshotHash(database: DatabaseSync): string {
  return snapshotHash(exportSqliteTables(database, sourceReaderBackupTables));
}

function snapshotRows(
  snapshot: SqliteModuleSnapshot,
  tableName: string
): Array<Record<string, unknown>> {
  const table = snapshot.tables.find(({ name }) => name === tableName);
  if (!table) throw new Error(`V22 module snapshot table is missing: ${tableName}`);
  return table.rows.map((row) =>
    Object.fromEntries(table.columns.map((column, index) => [column, row[index]]))
  );
}

function snapshotFields(
  snapshot: SqliteModuleSnapshot,
  tableName: string,
  fields: string[]
): unknown[][] {
  return snapshotRows(snapshot, tableName)
    .map((row) => fields.map((field) => row[field]))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function snapshotCount(snapshot: SqliteModuleSnapshot, tableName: string): number {
  return snapshotRows(snapshot, tableName).length;
}

export function assertValidV22Source(database: DatabaseSync): number {
  const integrity = database.prepare('PRAGMA integrity_check').get() as
    { integrity_check?: string } | undefined;
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
  const schema = database
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get() as { version: number | null };
  const errors: string[] = [];
  if (integrity?.integrity_check !== 'ok') errors.push('source integrity check failed');
  if (foreignKeys.length > 0) errors.push('source foreign key check failed');
  if (Number(schema.version) !== 22) errors.push(`source schema version is ${schema.version}`);
  if (errors.length > 0) {
    throw new V22ImportValidationError(`V22 import validation failed: ${errors.join('; ')}`, {
      errors
    });
  }
  return 22;
}

export function validateV22Import(
  source: DatabaseSync,
  candidate: DatabaseSync
): V22ImportValidation {
  const errors: string[] = [];
  const sourceIngestion = createV22IngestionSnapshot(source);
  const candidateIngestion = exportSqliteTables(candidate, ingestionBackupTables);
  const sourceScheduler = createV22SchedulerSnapshot(source);
  const candidateScheduler = exportSqliteTables(candidate, schedulerBackupTables);
  const sourceIds = {
    novels: ids(source, 'novels'),
    chapters: ids(source, 'chapters'),
    tasks: snapshotFields(sourceIngestion, 'ingestion_jobs', ['id']),
    ingestionJobChapters: snapshotFields(sourceIngestion, 'ingestion_job_chapters', [
      'job_id',
      'chapter_id'
    ]),
    ingestionEvents: snapshotFields(sourceIngestion, 'ingestion_events', ['id']),
    schedulerPolicies: snapshotFields(sourceScheduler, 'scheduler_policies', ['novel_id']),
    schedulerDiagnostics: snapshotFields(sourceScheduler, 'scheduler_diagnostics', ['id']),
    plugins: ids(source, 'source_reader_plugins')
  };
  const candidateIds = {
    novels: ids(candidate, 'library_novels'),
    chapters: ids(candidate, 'library_chapters'),
    tasks: snapshotFields(candidateIngestion, 'ingestion_jobs', ['id']),
    ingestionJobChapters: snapshotFields(candidateIngestion, 'ingestion_job_chapters', [
      'job_id',
      'chapter_id'
    ]),
    ingestionEvents: snapshotFields(candidateIngestion, 'ingestion_events', ['id']),
    schedulerPolicies: snapshotFields(candidateScheduler, 'scheduler_policies', ['novel_id']),
    schedulerDiagnostics: snapshotFields(candidateScheduler, 'scheduler_diagnostics', ['id']),
    plugins: ids(candidate, 'source_reader_plugins')
  };
  const idsPreserved = hash(sourceIds) === hash(candidateIds);
  if (!idsPreserved) errors.push('record IDs differ');

  const sourceTimestamps = {
    novels: source.prepare('SELECT id, created_at, updated_at FROM novels ORDER BY id').all(),
    tasks: source
      .prepare(
        `SELECT id, started_at, finished_at, paused_at, created_at, updated_at
         FROM crawl_tasks ORDER BY id`
      )
      .all(),
    ingestionJobChapters: snapshotFields(sourceIngestion, 'ingestion_job_chapters', [
      'job_id',
      'chapter_id',
      'updated_at'
    ]),
    ingestionEvents: snapshotFields(sourceIngestion, 'ingestion_events', ['id', 'created_at']),
    schedulerPolicies: snapshotFields(sourceScheduler, 'scheduler_policies', [
      'novel_id',
      'last_check_at',
      'next_check_at',
      'created_at',
      'updated_at'
    ]),
    schedulerDiagnostics: snapshotFields(sourceScheduler, 'scheduler_diagnostics', [
      'id',
      'created_at'
    ])
  };
  const candidateTimestamps = {
    novels: candidate
      .prepare('SELECT id, created_at, updated_at FROM library_novels ORDER BY id')
      .all(),
    tasks: candidate
      .prepare(
        `SELECT id, started_at, finished_at, paused_at, created_at, updated_at
         FROM ingestion_jobs ORDER BY id`
      )
      .all(),
    ingestionJobChapters: snapshotFields(candidateIngestion, 'ingestion_job_chapters', [
      'job_id',
      'chapter_id',
      'updated_at'
    ]),
    ingestionEvents: snapshotFields(candidateIngestion, 'ingestion_events', ['id', 'created_at']),
    schedulerPolicies: snapshotFields(candidateScheduler, 'scheduler_policies', [
      'novel_id',
      'last_check_at',
      'next_check_at',
      'created_at',
      'updated_at'
    ]),
    schedulerDiagnostics: snapshotFields(candidateScheduler, 'scheduler_diagnostics', [
      'id',
      'created_at'
    ])
  };
  const timestampsPreserved = hash(sourceTimestamps) === hash(candidateTimestamps);
  if (!timestampsPreserved) errors.push('timestamps differ');

  const recordCounts = {
    novels: { source: count(source, 'novels'), candidate: count(candidate, 'library_novels') },
    chapters: {
      source: count(source, 'chapters'),
      candidate: count(candidate, 'library_chapters')
    },
    tasks: {
      source: snapshotCount(sourceIngestion, 'ingestion_jobs'),
      candidate: snapshotCount(candidateIngestion, 'ingestion_jobs')
    },
    ingestionJobChapters: {
      source: snapshotCount(sourceIngestion, 'ingestion_job_chapters'),
      candidate: snapshotCount(candidateIngestion, 'ingestion_job_chapters')
    },
    ingestionEvents: {
      source: snapshotCount(sourceIngestion, 'ingestion_events'),
      candidate: snapshotCount(candidateIngestion, 'ingestion_events')
    },
    schedulerPolicies: {
      source: snapshotCount(sourceScheduler, 'scheduler_policies'),
      candidate: snapshotCount(candidateScheduler, 'scheduler_policies')
    },
    schedulerDiagnostics: {
      source: snapshotCount(sourceScheduler, 'scheduler_diagnostics'),
      candidate: snapshotCount(candidateScheduler, 'scheduler_diagnostics')
    },
    plugins: {
      source: count(source, 'source_reader_plugins'),
      candidate: count(candidate, 'source_reader_plugins')
    }
  };
  for (const [name, values] of Object.entries(recordCounts)) {
    if (values.source !== values.candidate) errors.push(`${name} count differs`);
  }

  const sourceChapterContent = source
    .prepare(
      `SELECT id, raw_text, clean_text, content_version
       FROM chapters ORDER BY id`
    )
    .all();
  const candidateChapterContent = candidate
    .prepare(
      `SELECT id, raw_text, clean_text, content_version
       FROM library_chapters ORDER BY id`
    )
    .all();
  const sourceChapterHash = hash(sourceChapterContent);
  const chapterContentSha256 = hash(candidateChapterContent);
  if (sourceChapterHash !== chapterContentSha256) errors.push('chapter content differs');

  const sourceTaskHash = snapshotHash(sourceIngestion);
  const taskOutcomeSha256 = snapshotHash(candidateIngestion);
  if (sourceTaskHash !== taskOutcomeSha256) errors.push('ingestion snapshot differs');

  const sourceReaderSourceHash = sortedSnapshotHash(source);
  const sourceReaderMetadataSha256 = sortedSnapshotHash(candidate);
  if (sourceReaderSourceHash !== sourceReaderMetadataSha256) {
    errors.push('Source Reader metadata differs');
  }

  const sourceSchedulerHash = snapshotHash(sourceScheduler);
  const schedulerPolicySha256 = snapshotHash(candidateScheduler);
  if (sourceSchedulerHash !== schedulerPolicySha256) errors.push('scheduler snapshot differs');

  const expectedSearchDocuments =
    count(source, 'novels') +
    Number(
      (
        source
          .prepare('SELECT COUNT(*) AS count FROM chapters WHERE source_available = 1')
          .get() as { count: number }
      ).count
    );
  const actualSearchDocuments = count(candidate, 'search_documents');
  const searchRebuilt = expectedSearchDocuments === actualSearchDocuments;
  if (!searchRebuilt) errors.push('search projection was not rebuilt');

  const integrity = candidate.prepare('PRAGMA integrity_check').get() as
    { integrity_check?: string } | undefined;
  if (integrity?.integrity_check !== 'ok') errors.push('candidate integrity check failed');
  if (candidate.prepare('PRAGMA foreign_key_check').all().length > 0) {
    errors.push('candidate foreign key check failed');
  }

  return {
    idsPreserved,
    timestampsPreserved,
    recordCounts,
    chapterContentSha256,
    taskOutcomeSha256,
    sourceReaderMetadataSha256,
    schedulerPolicySha256,
    searchRebuilt,
    errors
  };
}
