import type { SQLInputValue } from 'node:sqlite';
import type { ListLibraryNovelsQuery } from '../../domain/library.contracts.js';
import type {
  LibraryChapter,
  LibraryNovelDetail,
  LibraryStats,
  PaginatedLibraryNovels
} from '../../domain/library.models.js';
import type { LibraryRepository } from '../../domain/repositories/library.repository.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import { mapLibraryChapterRow, mapLibraryNovelRow } from './library-row.schemas.js';

const novelAggregateSelect = `
  SELECT
    n.*,
    COUNT(c.id) AS chapter_count,
    COALESCE(SUM(CASE WHEN c.status = 'fetched' THEN 1 ELSE 0 END), 0)
      AS fetched_chapter_count,
    COALESCE(SUM(CASE WHEN c.status = 'failed' THEN 1 ELSE 0 END), 0)
      AS failed_chapter_count,
    MIN(c.chapter_index) AS first_chapter_index
  FROM library_novels n
  LEFT JOIN library_chapters c
    ON c.novel_id = n.id AND c.source_available = 1
`;

export class LibrarySqliteRepository implements LibraryRepository {
  constructor(private readonly database: SqliteDatabase) {}

  readNovelById(id: string): LibraryNovelDetail | null {
    const row = this.database.connection
      .prepare(`${novelAggregateSelect} WHERE n.id = ? GROUP BY n.id`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      novel: mapLibraryNovelRow(row),
      chapters: this.readChaptersByNovelId(id)
    };
  }

  readNovelBySourceUrl(sourceUrl: string): LibraryNovelDetail | null {
    const row = this.database.connection
      .prepare('SELECT id FROM library_novels WHERE source_url = ?')
      .get(sourceUrl) as { id: string } | undefined;
    return row ? this.readNovelById(row.id) : null;
  }

  readChaptersByNovelId(novelId: string, includeUnavailable = false): LibraryChapter[] {
    const rows = this.database.connection
      .prepare(
        `SELECT *
           FROM library_chapters
          WHERE novel_id = ? ${includeUnavailable ? '' : 'AND source_available = 1'}
          ORDER BY chapter_index ASC, id ASC`
      )
      .all(novelId) as Record<string, unknown>[];
    return rows.map(mapLibraryChapterRow);
  }

  findNovelById(id: string): Promise<LibraryNovelDetail | null> {
    return Promise.resolve(this.readNovelById(id));
  }

  findNovelBySourceUrl(sourceUrl: string): Promise<LibraryNovelDetail | null> {
    return Promise.resolve(this.readNovelBySourceUrl(sourceUrl));
  }

  listNovels(query: ListLibraryNovelsQuery): Promise<PaginatedLibraryNovels> {
    const where: string[] = [];
    const values: SQLInputValue[] = [];
    const keyword = query.q?.trim();
    if (keyword) {
      const like = `%${keyword}%`;
      where.push('(n.title LIKE ? OR n.source_url LIKE ? OR n.source_name LIKE ?)');
      values.push(like, like, like);
    }
    if (query.status === 'active') {
      where.push("n.status <> 'completed'");
    } else if (query.status && query.status !== 'all') {
      where.push('n.status = ?');
      values.push(query.status);
    }
    if (query.ids) {
      if (query.ids.length === 0) where.push('1 = 0');
      else {
        where.push(`n.id IN (${query.ids.map(() => '?').join(', ')})`);
        values.push(...query.ids);
      }
    }
    if (query.excludeIds?.length) {
      where.push(`n.id NOT IN (${query.excludeIds.map(() => '?').join(', ')})`);
      values.push(...query.excludeIds);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const readingOrder = query.readingOrder ?? [];
    const orderValues: SQLInputValue[] = [];
    const readingOrderSql =
      readingOrder.length > 0
        ? `CASE n.id ${readingOrder
            .map((_, index) => `WHEN ? THEN ${index}`)
            .join(' ')} ELSE ${readingOrder.length} END, `
        : '';
    orderValues.push(...readingOrder);
    const orderSql =
      query.sort === 'title'
        ? 'ORDER BY n.title COLLATE NOCASE ASC, n.id ASC'
        : query.sort === 'created'
          ? 'ORDER BY n.created_at DESC, n.id ASC'
          : query.sort === 'chapters'
            ? 'ORDER BY chapter_count DESC, n.updated_at DESC, n.id ASC'
            : `ORDER BY ${readingOrderSql}n.updated_at DESC, n.id ASC`;

    const countRow = this.database.connection
      .prepare(`SELECT COUNT(*) AS total FROM library_novels n ${whereSql}`)
      .get(...values) as { total: number };
    const rows = this.database.connection
      .prepare(
        `${novelAggregateSelect}
         ${whereSql}
         GROUP BY n.id
         ${orderSql}
         LIMIT ? OFFSET ?`
      )
      .all(...values, ...orderValues, query.limit, query.offset) as Record<string, unknown>[];

    return Promise.resolve({
      items: rows.map(mapLibraryNovelRow),
      total: Number(countRow.total),
      limit: query.limit,
      offset: query.offset
    });
  }

  getStats(): Promise<LibraryStats> {
    const row = this.database.connection
      .prepare(
        `SELECT
           COUNT(*) AS novels,
           COALESCE(SUM(CASE WHEN status = 'analyzed' THEN 1 ELSE 0 END), 0) AS analyzed,
           COALESCE(SUM(CASE WHEN status = 'crawling' THEN 1 ELSE 0 END), 0) AS crawling,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
           COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
         FROM library_novels`
      )
      .get() as Record<keyof LibraryStats, number>;
    return Promise.resolve({
      novels: Number(row.novels),
      analyzed: Number(row.analyzed),
      crawling: Number(row.crawling),
      completed: Number(row.completed),
      failed: Number(row.failed)
    });
  }

  getChapter(novelId: string, chapterIndex: number): Promise<LibraryChapter | null> {
    const row = this.database.connection
      .prepare(
        `SELECT *
           FROM library_chapters
          WHERE novel_id = ? AND chapter_index = ? AND source_available = 1`
      )
      .get(novelId, chapterIndex) as Record<string, unknown> | undefined;
    return Promise.resolve(row ? mapLibraryChapterRow(row) : null);
  }
}
