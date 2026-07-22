import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import { TaskConflictError } from '../../application/errors/task.error.js';
import type { TaskRepository } from '../../domain/repositories/task.repository.js';
import type { CrawlTask } from '../../domain/entities/task.entity.js';
import { mapTaskRow, toTaskInsertValues, toTaskUpdateValues } from '../mappers/task.mapper.js';
export class TaskSqliteRepository implements TaskRepository {
  constructor(private readonly database: SqliteDatabase) {}
  async create(task: CrawlTask, chapterIds: string[] = []) {
    try {
      this.database.connection
        .prepare(
          `INSERT INTO crawl_tasks (id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,error_message,started_at,finished_at,paused_at,total_paused_ms,current_speed,average_speed,eta_seconds,created_at,updated_at,chapter_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(...toTaskInsertValues(task), JSON.stringify(chapterIds));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('idx_crawl_tasks_one_active_per_novel') ||
        message.includes('UNIQUE constraint failed: crawl_tasks.novel_id')
      ) {
        throw new TaskConflictError('Novel already has an active crawl task');
      }
      throw error;
    }
  }
  async update(task: CrawlTask) {
    this.database.connection
      .prepare(
        `UPDATE crawl_tasks SET status=?,outcome=?,total_chapters=?,fetched_chapters=?,failed_chapters=?,error_message=?,started_at=?,finished_at=?,paused_at=?,total_paused_ms=?,current_speed=?,average_speed=?,eta_seconds=?,updated_at=? WHERE id=?`
      )
      .run(...toTaskUpdateValues(task));
  }
  async findById(id: string) {
    const row = this.database.connection.prepare('SELECT * FROM crawl_tasks WHERE id=?').get(id) as
      Record<string, unknown> | undefined;
    return row ? mapTaskRow(row) : null;
  }
  async findChapterIds(taskId: string) {
    const row = this.database.connection
      .prepare('SELECT chapter_ids_json FROM crawl_tasks WHERE id=?')
      .get(taskId) as { chapter_ids_json?: unknown } | undefined;
    if (!row || typeof row.chapter_ids_json !== 'string' || !row.chapter_ids_json) return [];
    try {
      const value = JSON.parse(row.chapter_ids_json);
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
  async findByNovelId(novelId: string) {
    const row = this.database.connection
      .prepare('SELECT * FROM crawl_tasks WHERE novel_id=? ORDER BY created_at DESC LIMIT 1')
      .get(novelId) as Record<string, unknown> | undefined;
    return row ? mapTaskRow(row) : null;
  }
  async findAll(limit = 50) {
    return (
      this.database.connection
        .prepare('SELECT * FROM crawl_tasks ORDER BY created_at DESC LIMIT ?')
        .all(limit) as Record<string, unknown>[]
    ).map(mapTaskRow);
  }
  async countActive() {
    const row = this.database.connection
      .prepare(
        `SELECT COUNT(*) AS count FROM crawl_tasks WHERE status IN ('queued','running','pausing','resuming')`
      )
      .get() as { count: number };
    return row.count;
  }
  async findRecoverable(limit = 50) {
    return (
      this.database.connection
        .prepare(
          `SELECT * FROM crawl_tasks WHERE status IN ('queued','running','pausing','paused','resuming') ORDER BY updated_at DESC LIMIT ?`
        )
        .all(limit) as Record<string, unknown>[]
    ).map(mapTaskRow);
  }
  async findInterrupted(limit = 50) {
    return (
      this.database.connection
        .prepare(
          `SELECT * FROM crawl_tasks WHERE status IN ('queued','running','pausing','resuming') ORDER BY updated_at DESC LIMIT ?`
        )
        .all(limit) as Record<string, unknown>[]
    ).map(mapTaskRow);
  }
  async hasActiveForNovel(novelId: string) {
    const row = this.database.connection
      .prepare(
        `SELECT 1 AS found FROM crawl_tasks WHERE novel_id=? AND status IN ('queued','running','pausing','paused','resuming') LIMIT 1`
      )
      .get(novelId) as { found: number } | undefined;
    return Boolean(row);
  }
}
