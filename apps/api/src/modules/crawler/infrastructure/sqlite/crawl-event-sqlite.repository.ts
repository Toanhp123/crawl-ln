import { z } from 'zod';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type { CrawlEventRepository } from '../../domain/repositories/crawl-event.repository.js';
import type { CrawlEvent } from '../../domain/events/crawl-event.entity.js';
const rowSchema = z.object({
  id: z.string().min(1),
  task_id: z.string().min(1),
  type: z.enum([
    'task_created',
    'started',
    'chapter_started',
    'chapter_succeeded',
    'chapter_failed',
    'chapter_retry',
    'pause_requested',
    'paused',
    'resume_requested',
    'resumed',
    'cancelled',
    'completed',
    'failed',
    'recovered_paused'
  ]),
  level: z.enum(['info', 'success', 'warning', 'error']),
  message: z.string(),
  chapter_id: z.string().nullable().optional(),
  chapter_index: z.coerce.number().int().nonnegative().nullable().optional(),
  chapter_title: z.string().nullable().optional(),
  attempt: z.coerce.number().int().nonnegative().nullable().optional(),
  created_at: z.string().datetime({ offset: true })
});
export class CrawlEventSqliteRepository implements CrawlEventRepository {
  constructor(private readonly database: SqliteDatabase) {}
  async create(event: CrawlEvent) {
    this.database.connection
      .prepare(
        `INSERT INTO crawl_events (id,task_id,type,level,message,chapter_id,chapter_index,chapter_title,attempt,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        event.id,
        event.taskId,
        event.type,
        event.level,
        event.message,
        event.chapterId ?? null,
        event.chapterIndex ?? null,
        event.chapterTitle ?? null,
        event.attempt ?? null,
        event.createdAt
      );
  }
  async findByTaskId(taskId: string, limit = 100) {
    const rows = this.database.connection
      .prepare(`SELECT * FROM crawl_events WHERE task_id=? ORDER BY created_at DESC LIMIT ?`)
      .all(taskId, limit) as Record<string, unknown>[];
    return rows.map((input) => {
      const row = rowSchema.parse(input);
      return {
        id: row.id,
        taskId: row.task_id,
        type: row.type,
        level: row.level,
        message: row.message,
        chapterId: row.chapter_id ?? undefined,
        chapterIndex: row.chapter_index ?? undefined,
        chapterTitle: row.chapter_title ?? undefined,
        attempt: row.attempt ?? undefined,
        createdAt: row.created_at
      };
    });
  }
}
