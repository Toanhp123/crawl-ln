import type { SQLInputValue } from 'node:sqlite';
import type { Novel } from '@novel-tool/shared';
import type { NovelRepository } from '../../domain/repositories/novel.repository.js';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import { mapNovelRow } from '../mappers/novel.mapper.js';

export class NovelSqliteRepository implements NovelRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async list(options: {
    q?: string;
    status: 'all' | 'completed' | 'active' | 'analyzed' | 'crawling' | 'failed' | 'importing';
    sort: 'recent' | 'created' | 'title' | 'chapters';
    limit: number;
    offset: number;
    ids?: string;
    excludeIds?: string;
    readingOrder?: string;
  }) {
    const parseIds = (value?: string) =>
      [
        ...new Set(
          (value ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        )
      ].slice(0, 50);
    const includeIds = parseIds(options.ids);
    const excludeIds = parseIds(options.excludeIds);
    const readingOrder = parseIds(options.readingOrder);
    const where: string[] = [];
    const values: SQLInputValue[] = [];
    const keyword = options.q?.trim();
    if (keyword) {
      const like = `%${keyword}%`;
      where.push('(n.title LIKE ? OR n.source_url LIKE ? OR n.source_name LIKE ?)');
      values.push(like, like, like);
    }
    if (options.status === 'completed') (where.push('n.status = ?'), values.push('completed'));
    else if (options.status === 'active') (where.push('n.status <> ?'), values.push('completed'));
    else if (options.status === 'importing') where.push("n.status IN ('analyzed', 'crawling')");
    else if (options.status !== 'all') (where.push('n.status = ?'), values.push(options.status));
    if (includeIds.length) {
      where.push(`n.id IN (${includeIds.map(() => '?').join(', ')})`);
      values.push(...includeIds);
    } else if (options.ids !== undefined) {
      where.push('1 = 0');
    }
    if (excludeIds.length) {
      where.push(`n.id NOT IN (${excludeIds.map(() => '?').join(', ')})`);
      values.push(...excludeIds);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderValues: SQLInputValue[] = [];
    const readingOrderSql = readingOrder.length
      ? `CASE n.id ${readingOrder.map((_, index) => `WHEN ? THEN ${index}`).join(' ')} ELSE ${readingOrder.length} END, `
      : '';
    orderValues.push(...readingOrder);
    const orderSql =
      options.sort === 'title'
        ? 'ORDER BY n.title COLLATE NOCASE ASC'
        : options.sort === 'created'
          ? 'ORDER BY n.created_at DESC'
          : options.sort === 'chapters'
            ? 'ORDER BY chapter_count DESC, n.updated_at DESC'
            : `ORDER BY ${readingOrderSql}n.updated_at DESC`;
    const countRow = this.database.connection
      .prepare(`SELECT COUNT(*) AS total FROM novels n ${whereSql}`)
      .get(...values) as { total: number };
    const rows = this.database.connection
      .prepare(
        `
        SELECT
          n.*,
          COUNT(c.id) AS chapter_count,
          COALESCE(SUM(CASE WHEN c.status = 'fetched' THEN 1 ELSE 0 END), 0) AS fetched_chapter_count,
          COALESCE(SUM(CASE WHEN c.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_chapter_count,
          MIN(c.chapter_index) AS first_chapter_index
        FROM novels n
        LEFT JOIN chapters c ON c.novel_id = n.id AND c.source_available = 1
        ${whereSql}
        GROUP BY n.id
        ${orderSql}
        LIMIT ? OFFSET ?
      `
      )
      .all(...values, ...orderValues, options.limit, options.offset) as Record<string, unknown>[];
    return {
      items: rows.map(mapNovelRow),
      total: Number(countRow.total),
      limit: options.limit,
      offset: options.offset
    };
  }

  async findAll(): Promise<Novel[]> {
    const rows = this.database.connection
      .prepare('SELECT * FROM novels ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(mapNovelRow);
  }

  async search(keyword: string): Promise<Novel[]> {
    const like = `%${keyword.trim()}%`;
    const rows = this.database.connection
      .prepare(
        `
      SELECT * FROM novels
      WHERE title LIKE ? OR source_url LIKE ? OR source_name LIKE ?
      ORDER BY updated_at DESC
    `
      )
      .all(like, like, like) as Record<string, unknown>[];
    return rows.map(mapNovelRow);
  }

  async findById(id: string): Promise<Novel | null> {
    const novelRow = this.database.connection
      .prepare('SELECT * FROM novels WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return novelRow ? mapNovelRow(novelRow) : null;
  }

  async findBySourceUrl(sourceUrl: string): Promise<Novel | null> {
    const novelRow = this.database.connection
      .prepare('SELECT * FROM novels WHERE source_url = ?')
      .get(sourceUrl) as Record<string, unknown> | undefined;
    return novelRow ? mapNovelRow(novelRow) : null;
  }

  async updateNovel(novel: Novel): Promise<void> {
    this.database.connection
      .prepare(
        `
      UPDATE novels
      SET title = ?, source_url = ?, source_name = ?, status = ?, updated_at = ?,
          auto_update_enabled = ?, update_interval_minutes = ?, last_update_check_at = ?,
          next_update_check_at = ?, last_update_result = ?, consecutive_update_failures = ?
      WHERE id = ?
    `
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
