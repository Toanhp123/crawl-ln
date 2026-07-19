import type { SQLInputValue } from 'node:sqlite';
import type { Chapter, Novel } from '@novel-tool/shared';
import type { NovelAnalysisPersistencePort } from '../../application/ports/novel-analysis-persistence.port.js';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import { toNovelInsertValues } from '../mappers/novel.mapper.js';

function toChapterInsertValues(
  chapter: Chapter,
  novelId = chapter.novelId
): readonly SQLInputValue[] {
  return [
    chapter.id,
    novelId,
    chapter.index,
    chapter.title,
    chapter.sourceUrl,
    chapter.rawText ?? null,
    chapter.cleanText ?? null,
    chapter.status,
    chapter.errorMessage ?? null
  ];
}

export class NovelAnalysisSqliteAdapter implements NovelAnalysisPersistencePort {
  constructor(private readonly database: SqliteDatabase) {}

  async persist(novel: Novel, chapters: Chapter[]): Promise<void> {
    const insertNovel = this.database.connection.prepare(`
      INSERT INTO novels (id, title, source_url, source_name, author, cover_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_url) DO UPDATE SET
        title = excluded.title,
        source_name = excluded.source_name,
        author = excluded.author,
        cover_url = excluded.cover_url,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);
    const getNovelId = this.database.connection.prepare(
      'SELECT id FROM novels WHERE source_url = ?'
    );
    const shiftExisting = this.database.connection.prepare(
      'UPDATE chapters SET chapter_index = chapter_index + ? WHERE novel_id = ?'
    );
    const markMissing = this.database.connection.prepare(
      'UPDATE chapters SET source_available = 0 WHERE novel_id = ?'
    );
    const findBySourceUrl = this.database.connection.prepare(
      'SELECT id FROM chapters WHERE novel_id = ? AND source_url = ?'
    );
    const updateExisting = this.database.connection.prepare(`
      UPDATE chapters
      SET chapter_index = ?, title = ?, source_available = 1
      WHERE id = ?
    `);
    const insertChapter = this.database.connection.prepare(`
      INSERT INTO chapters (id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status, error_message, source_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const listMissing = this.database.connection.prepare(
      'SELECT id FROM chapters WHERE novel_id = ? AND source_available = 0 ORDER BY chapter_index ASC, id ASC'
    );
    const moveMissing = this.database.connection.prepare(
      'UPDATE chapters SET chapter_index = ? WHERE id = ?'
    );

    this.database.transactionSync(() => {
      insertNovel.run(...toNovelInsertValues(novel));
      const persisted = getNovelId.get(novel.sourceUrl) as { id: string } | undefined;
      const novelId = persisted?.id ?? novel.id;
      const offset = Math.max(1_000_000, chapters.length * 2 + 1);
      shiftExisting.run(offset, novelId);
      markMissing.run(novelId);

      for (const chapter of chapters) {
        const existing = findBySourceUrl.get(novelId, chapter.sourceUrl) as
          { id: string } | undefined;
        if (existing) {
          updateExisting.run(chapter.index, chapter.title, existing.id);
        } else {
          insertChapter.run(...toChapterInsertValues(chapter, novelId));
        }
      }

      const missing = listMissing.all(novelId) as Array<{ id: string }>;
      let missingIndex = chapters.length + 1;
      for (const chapter of missing) moveMissing.run(missingIndex++, chapter.id);
    });
  }
}
