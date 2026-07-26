import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestionMigrations } from '../../apps/api/src/modules/ingestion/infrastructure/migrations/001-ingestion-schema.ts';
import { IngestionSqliteRepository } from '../../apps/api/src/modules/ingestion/infrastructure/sqlite/ingestion-sqlite.repository.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

function insertJob(database: SqliteDatabase, id: string, novelId: string) {
  database.connection
    .prepare(
      `INSERT INTO ingestion_jobs(
         id, novel_id, status, outcome, total_chapters, fetched_chapters, failed_chapters,
         total_paused_ms, current_speed, average_speed, created_at, updated_at
       ) VALUES (?, ?, 'failed', 'failure', 1, 0, 1, 0, 0, 0, ?, ?)`
    )
    .run(id, novelId, '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z');
  database.connection
    .prepare(
      `INSERT INTO ingestion_job_chapters(job_id, chapter_id, position, status, updated_at)
       VALUES (?, ?, 0, 'failed', ?)`
    )
    .run(id, `${id}-chapter`, '2026-07-27T00:00:00.000Z');
  database.connection
    .prepare(
      `INSERT INTO ingestion_events(id, job_id, type, level, message, created_at)
       VALUES (?, ?, 'failed', 'error', 'failed', ?)`
    )
    .run(`${id}-event`, id, '2026-07-27T00:00:00.000Z');
}

test('purging ingestion jobs for a novel cascades task state and events only for that novel', async (t) => {
  const database = new SqliteDatabase(':memory:');
  t.after(() => database.close());
  for (const migration of ingestionMigrations) migration.up(database.connection);
  insertJob(database, 'job-delete', 'novel-delete');
  insertJob(database, 'job-keep', 'novel-keep');
  const repository = new IngestionSqliteRepository(database);

  await repository.deleteByNovelId('novel-delete');

  for (const table of ['ingestion_jobs', 'ingestion_job_chapters', 'ingestion_events']) {
    const deleted = database.connection
      .prepare(
        `SELECT COUNT(*) AS count FROM ${table} WHERE ${table === 'ingestion_jobs' ? 'novel_id' : 'job_id'} = ?`
      )
      .get(table === 'ingestion_jobs' ? 'novel-delete' : 'job-delete') as { count: number };
    assert.equal(Number(deleted.count), 0);
  }
  assert.equal((await repository.findById('job-keep'))?.novelId, 'novel-keep');
});
