import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type {
  SearchProjectionEvent,
  SearchRepository
} from '../../application/ports/search.repository.js';
import type {
  SearchDocument,
  SearchIndexMetadata,
  SearchIndexRebuildResult,
  SearchQuery,
  SearchResultItem,
  SearchResultPage
} from '../../domain/search.models.js';

const countRowSchema = z.object({ count: z.coerce.number().int().nonnegative() });
const metadataRowSchema = z.object({
  last_rebuilt_at: z.string().min(1),
  last_indexed_documents: z.coerce.number().int().nonnegative()
});
const searchRowSchema = z.object({
  document_type: z.enum(['novel', 'chapter']),
  document_id: z.string().min(1),
  novel_id: z.string().min(1),
  chapter_index: z.coerce.number().int().nonnegative().nullable(),
  title: z.string(),
  novel_title: z.string(),
  snippet: z.string()
});

function toFtsQuery(input: string): string | null {
  const terms =
    input
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(Boolean) ?? [];
  if (terms.length === 0) return null;
  return terms
    .slice(0, 12)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(' AND ');
}

function mapSearchResult(input: unknown): SearchResultItem {
  const row = searchRowSchema.parse(input);
  return {
    type: row.document_type,
    documentId: row.document_id,
    novelId: row.novel_id,
    novelTitle: row.novel_title,
    ...(row.chapter_index === null ? {} : { chapterIndex: row.chapter_index }),
    title: row.title,
    snippet: row.snippet
  };
}

export class SearchSqliteRepository implements SearchRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async search(input: SearchQuery): Promise<SearchResultPage> {
    const query = toFtsQuery(input.query);
    if (!query) {
      return {
        query: input.query,
        total: 0,
        limit: input.limit,
        offset: input.offset,
        items: []
      };
    }
    const where = ['search_documents MATCH ?'];
    const values: SQLInputValue[] = [query];
    if (input.type !== 'all') {
      where.push('document_type = ?');
      values.push(input.type);
    }
    if (input.novelId) {
      where.push('novel_id = ?');
      values.push(input.novelId);
    }
    const clause = where.join(' AND ');
    const total = countRowSchema.parse(
      this.database.connection
        .prepare(`SELECT COUNT(*) AS count FROM search_documents WHERE ${clause}`)
        .get(...values)
    ).count;
    const rows = this.database.connection
      .prepare(
        `SELECT
           document_type,
           document_id,
           novel_id,
           chapter_index,
           title,
           CASE WHEN document_type = 'novel' THEN title ELSE subtitle END AS novel_title,
           CASE
             WHEN length(content) > 0
               THEN snippet(search_documents, 6, '<mark>', '</mark>', ' ... ', 28)
             ELSE highlight(search_documents, 4, '<mark>', '</mark>')
           END AS snippet
         FROM search_documents
         WHERE ${clause}
         ORDER BY bm25(search_documents, 0, 0, 0, 0, 12, 5, 1) ASC,
                  document_type DESC,
                  chapter_index ASC
         LIMIT ? OFFSET ?`
      )
      .all(...values, input.limit, input.offset);
    return {
      query: input.query,
      total,
      limit: input.limit,
      offset: input.offset,
      items: rows.map(mapSearchResult)
    };
  }

  async countDocuments(): Promise<number> {
    return countRowSchema.parse(
      this.database.connection.prepare('SELECT COUNT(*) AS count FROM search_documents').get()
    ).count;
  }

  async getIndexMetadata(): Promise<SearchIndexMetadata | null> {
    const row = this.database.connection
      .prepare(
        `SELECT last_rebuilt_at, last_indexed_documents
         FROM search_index_metadata
         WHERE id = 1`
      )
      .get();
    if (!row) return null;

    const metadata = metadataRowSchema.parse(row);
    return {
      lastRebuiltAt: metadata.last_rebuilt_at,
      lastIndexedDocuments: metadata.last_indexed_documents
    };
  }

  async replaceAllForRebuild(
    documents: SearchDocument[],
    rebuiltAt: string
  ): Promise<SearchIndexRebuildResult> {
    return this.database.transactionSync(() => {
      this.database.connection.exec('DELETE FROM search_documents;');
      for (const document of documents) this.insertDocument(document);
      this.database.connection
        .prepare(
          `INSERT OR REPLACE INTO search_index_metadata(
             id, last_rebuilt_at, last_indexed_documents
           ) VALUES (1, ?, ?)`
        )
        .run(rebuiltAt, documents.length);
      return { indexedDocuments: documents.length, rebuiltAt };
    });
  }

  async replaceNovelForEvent(
    event: SearchProjectionEvent,
    novelId: string,
    documents: SearchDocument[]
  ): Promise<boolean> {
    return this.applyEvent(event, () => {
      this.database.connection
        .prepare('DELETE FROM search_documents WHERE novel_id = ?')
        .run(novelId);
      for (const document of documents) this.insertDocument(document);
    });
  }

  async replaceChapterForEvent(
    event: SearchProjectionEvent,
    document: SearchDocument
  ): Promise<boolean> {
    return this.applyEvent(event, () => {
      this.database.connection
        .prepare(
          `DELETE FROM search_documents
           WHERE document_type = 'chapter' AND document_id = ?`
        )
        .run(document.documentId);
      this.insertDocument(document);
    });
  }

  async deleteNovelForEvent(event: SearchProjectionEvent, novelId: string): Promise<boolean> {
    return this.applyEvent(event, () => {
      this.database.connection
        .prepare('DELETE FROM search_documents WHERE novel_id = ?')
        .run(novelId);
    });
  }

  private applyEvent(event: SearchProjectionEvent, project: () => void): boolean {
    return this.database.transactionSync(() => {
      const checkpoint = this.database.connection
        .prepare('SELECT 1 AS found FROM search_projection_checkpoints WHERE event_id = ?')
        .get(event.id);
      if (checkpoint) return false;
      project();
      this.database.connection
        .prepare(
          `INSERT INTO search_projection_checkpoints(event_id, event_type, projected_at)
           VALUES (?, ?, ?)`
        )
        .run(event.id, event.type, event.projectedAt);
      return true;
    });
  }

  private insertDocument(document: SearchDocument): void {
    this.database.connection
      .prepare(
        `INSERT INTO search_documents(
           document_type, document_id, novel_id, chapter_index, title, subtitle, content
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        document.type,
        document.documentId,
        document.novelId,
        document.chapterIndex ?? null,
        document.title,
        document.subtitle,
        document.content
      );
  }
}
