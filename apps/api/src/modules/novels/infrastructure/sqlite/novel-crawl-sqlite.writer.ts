import type { Novel } from '@novel-tool/shared';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';

export class NovelCrawlSqliteWriter {
  constructor(private readonly database: SqliteDatabase) {}

  update(novel: Novel): void {
    this.database.connection
      .prepare(
        `UPDATE novels
         SET title=?, source_url=?, source_name=?, status=?, updated_at=?,
             auto_update_enabled=?, update_interval_minutes=?, last_update_check_at=?, next_update_check_at=?,
             last_update_result=?, consecutive_update_failures=?
         WHERE id=?`
      )
      .run(
        novel.title,
        novel.sourceUrl,
        novel.sourceName,
        novel.status,
        novel.updatedAt,
        novel.autoUpdateEnabled ? 1 : 0,
        novel.updateIntervalMinutes ?? 1440,
        novel.lastUpdateCheckAt ?? null,
        novel.nextUpdateCheckAt ?? null,
        novel.lastUpdateResult ?? 'idle',
        novel.consecutiveUpdateFailures ?? 0,
        novel.id
      );
  }
}
