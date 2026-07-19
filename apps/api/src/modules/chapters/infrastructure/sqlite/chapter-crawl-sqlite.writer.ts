import type { Chapter } from '@novel-tool/shared';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import { toChapterUpdateValues } from '../mappers/chapter.mapper.js';

export class ChapterCrawlSqliteWriter {
  constructor(private readonly database: SqliteDatabase) {}

  update(chapter: Chapter): void {
    this.database.connection
      .prepare(
        `UPDATE chapters
         SET title = ?, raw_text = ?, clean_text = ?, status = ?, error_message = ?, content_version = content_version + 1
         WHERE id = ?`
      )
      .run(...toChapterUpdateValues(chapter));
  }
}
