import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { exportSqliteTables } from '../backup/sqlite-table-snapshot.js';
import { sourceReaderBackupTables } from '../../modules/source-reader/infrastructure/backup/source-reader-backup.contributor.js';

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

function sourceSchedulerPolicies(database: DatabaseSync): Array<Record<string, unknown>> {
  return database
    .prepare(
      `SELECT
         id AS novel_id,
         auto_update_enabled AS enabled,
         update_interval_minutes AS interval_minutes,
         last_update_check_at AS last_check_at,
         next_update_check_at AS next_check_at,
         last_update_result AS last_result,
         consecutive_update_failures AS consecutive_failures,
         created_at,
         updated_at
       FROM novels ORDER BY id`
    )
    .all() as Array<Record<string, unknown>>;
}

function candidateSchedulerPolicies(database: DatabaseSync): Array<Record<string, unknown>> {
  return database
    .prepare(
      `SELECT novel_id, enabled, interval_minutes, last_check_at, next_check_at,
              last_result, consecutive_failures, created_at, updated_at
       FROM scheduler_policies ORDER BY novel_id`
    )
    .all() as Array<Record<string, unknown>>;
}

function sortedSnapshotHash(database: DatabaseSync): string {
  const snapshot = exportSqliteTables(database, sourceReaderBackupTables);
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
  return hash(sorted);
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
  const sourceIds = {
    novels: ids(source, 'novels'),
    chapters: ids(source, 'chapters'),
    tasks: ids(source, 'crawl_tasks'),
    plugins: ids(source, 'source_reader_plugins')
  };
  const candidateIds = {
    novels: ids(candidate, 'library_novels'),
    chapters: ids(candidate, 'library_chapters'),
    tasks: ids(candidate, 'ingestion_jobs'),
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
      .all()
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
      .all()
  };
  const timestampsPreserved = hash(sourceTimestamps) === hash(candidateTimestamps);
  if (!timestampsPreserved) errors.push('timestamps differ');

  const tablePairs = {
    novels: ['novels', 'library_novels'],
    chapters: ['chapters', 'library_chapters'],
    tasks: ['crawl_tasks', 'ingestion_jobs'],
    plugins: ['source_reader_plugins', 'source_reader_plugins']
  } as const;
  const recordCounts = Object.fromEntries(
    Object.entries(tablePairs).map(([name, [sourceTable, candidateTable]]) => [
      name,
      { source: count(source, sourceTable), candidate: count(candidate, candidateTable) }
    ])
  );
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

  const sourceTaskOutcomes = source
    .prepare(
      `SELECT id, status, outcome, total_chapters, fetched_chapters, failed_chapters,
              error_message
       FROM crawl_tasks ORDER BY id`
    )
    .all();
  const candidateTaskOutcomes = candidate
    .prepare(
      `SELECT id, status, outcome, total_chapters, fetched_chapters, failed_chapters,
              error_message
       FROM ingestion_jobs ORDER BY id`
    )
    .all();
  const sourceTaskHash = hash(sourceTaskOutcomes);
  const taskOutcomeSha256 = hash(candidateTaskOutcomes);
  if (sourceTaskHash !== taskOutcomeSha256) errors.push('task outcomes differ');

  const sourceReaderSourceHash = sortedSnapshotHash(source);
  const sourceReaderMetadataSha256 = sortedSnapshotHash(candidate);
  if (sourceReaderSourceHash !== sourceReaderMetadataSha256) {
    errors.push('Source Reader metadata differs');
  }

  const sourceSchedulerHash = hash(sourceSchedulerPolicies(source));
  const schedulerPolicySha256 = hash(candidateSchedulerPolicies(candidate));
  if (sourceSchedulerHash !== schedulerPolicySha256) errors.push('scheduler policies differ');

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
