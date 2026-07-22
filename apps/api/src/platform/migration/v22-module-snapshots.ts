import type { DatabaseSync } from 'node:sqlite';
import { createTableSnapshot, type SqliteModuleSnapshot } from '../backup/sqlite-table-snapshot.js';

function rows(database: DatabaseSync, query: string): Array<Record<string, unknown>> {
  return database.prepare(query).all() as Array<Record<string, unknown>>;
}

export function createV22LibrarySnapshot(source: DatabaseSync): SqliteModuleSnapshot {
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

export function createV22IngestionSnapshot(source: DatabaseSync): SqliteModuleSnapshot {
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

export function createV22SchedulerSnapshot(source: DatabaseSync): SqliteModuleSnapshot {
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
