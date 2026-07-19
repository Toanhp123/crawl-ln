import type { CrawlTask } from '@novel-tool/shared';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import { toTaskUpdateValues } from '../mappers/task.mapper.js';

export class TaskCrawlSqliteWriter {
  constructor(private readonly database: SqliteDatabase) {}

  update(task: CrawlTask): void {
    this.database.connection
      .prepare(
        `UPDATE crawl_tasks
         SET status=?,outcome=?,total_chapters=?,fetched_chapters=?,failed_chapters=?,error_message=?,
             started_at=?,finished_at=?,paused_at=?,total_paused_ms=?,current_speed=?,average_speed=?,eta_seconds=?,updated_at=?
         WHERE id=?`
      )
      .run(...toTaskUpdateValues(task));
  }
}
