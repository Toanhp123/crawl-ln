import type { Chapter } from '@novel-tool/shared';
import type { ChapterRepository } from '../../domain/repositories/chapter.repository.js';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import { mapChapterRow, toChapterUpdateValues } from '../mappers/chapter.mapper.js';

export class ChapterSqliteRepository implements ChapterRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async findByNovelAndIndex(novelId: string, chapterIndex: number): Promise<Chapter | null> {
    const row = this.database.connection
      .prepare(
        'SELECT * FROM chapters WHERE novel_id = ? AND chapter_index = ? AND source_available = 1'
      )
      .get(novelId, chapterIndex) as Record<string, unknown> | undefined;
    return row ? mapChapterRow(row) : null;
  }

  async listByNovelId(novelId: string): Promise<Chapter[]> {
    const rows = this.database.connection
      .prepare(
        'SELECT * FROM chapters WHERE novel_id = ? AND source_available = 1 ORDER BY chapter_index ASC'
      )
      .all(novelId) as Record<string, unknown>[];
    return rows.map(mapChapterRow);
  }

  async update(chapter: Chapter): Promise<void> {
    this.database.connection
      .prepare(
        `
      UPDATE chapters
      SET title = ?, raw_text = ?, clean_text = ?, status = ?, error_message = ?, content_version = content_version + 1
      WHERE id = ?
    `
      )
      .run(...toChapterUpdateValues(chapter));
  }
}
