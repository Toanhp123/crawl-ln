import { z } from 'zod';
import type { NovelUpdateDiagnostic } from '../application/models/scheduler-contracts.js';
import type { SqliteDatabase } from '../../../shared/database/sqlite.js';
import type { SchedulerDiagnosticsRepository } from '../application/ports/scheduler-diagnostics.repository.js';
const rowSchema = z.object({
  id: z.string().min(1),
  novel_id: z.string().min(1),
  source_name: z.string().min(1),
  result: z.enum(['idle', 'up_to_date', 'queued', 'skipped_active_task', 'failed']),
  message: z.string(),
  new_chapter_count: z.coerce.number().int().nonnegative(),
  pending_chapter_count: z.coerce.number().int().nonnegative(),
  duration_ms: z.coerce.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true })
});
export class SchedulerSqliteRepository implements SchedulerDiagnosticsRepository {
  constructor(private readonly database: SqliteDatabase) {}
  async add(entry: NovelUpdateDiagnostic): Promise<void> {
    this.database.connection
      .prepare(
        `INSERT INTO novel_update_diagnostics (id, novel_id, source_name, result, message, new_chapter_count, pending_chapter_count, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.novelId,
        entry.sourceName,
        entry.result,
        entry.message,
        entry.newChapterCount,
        entry.pendingChapterCount,
        entry.durationMs,
        entry.createdAt
      );
  }
  async pruneByNovel(novelId: string, keep: number): Promise<void> {
    this.database.connection
      .prepare(
        `DELETE FROM novel_update_diagnostics WHERE novel_id = ? AND id NOT IN (SELECT id FROM novel_update_diagnostics WHERE novel_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`
      )
      .run(novelId, novelId, keep);
  }
  async listByNovel(novelId: string, limit = 30): Promise<NovelUpdateDiagnostic[]> {
    const rows = this.database.connection
      .prepare(
        'SELECT * FROM novel_update_diagnostics WHERE novel_id = ? ORDER BY created_at DESC LIMIT ?'
      )
      .all(novelId, limit) as Record<string, unknown>[];
    return rows.map((input) => {
      const row = rowSchema.parse(input);
      return {
        id: row.id,
        novelId: row.novel_id,
        sourceName: row.source_name,
        result: row.result,
        message: row.message,
        newChapterCount: row.new_chapter_count,
        pendingChapterCount: row.pending_chapter_count,
        durationMs: row.duration_ms,
        createdAt: row.created_at
      };
    });
  }
}
