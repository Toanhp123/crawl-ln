import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type { SearchRepository } from '../../application/ports/search.repository.js';
import type { SearchQuery, SearchResultItem, SearchResultPage } from '../../domain/search.js';
function toFtsQuery(input: string) {
  const terms =
    input
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(Boolean) ?? [];
  return terms.length
    ? terms
        .slice(0, 12)
        .map((t) => `"${t.replaceAll('"', '""')}"*`)
        .join(' AND ')
    : null;
}
export class SearchSqliteRepository implements SearchRepository {
  constructor(private readonly database: SqliteDatabase) {}
  async search(input: SearchQuery): Promise<SearchResultPage> {
    const q = toFtsQuery(input.query);
    if (!q)
      return { query: input.query, total: 0, limit: input.limit, offset: input.offset, items: [] };
    const where = ['search_documents MATCH ?'];
    const params: Array<string | number> = [q];
    if (input.type !== 'all') {
      where.push('document_type=?');
      params.push(input.type);
    }
    if (input.novelId) {
      where.push('novel_id=?');
      params.push(input.novelId);
    }
    const clause = where.join(' AND ');
    const total = Number(
      (
        this.database.connection
          .prepare(`SELECT COUNT(*) count FROM search_documents WHERE ${clause}`)
          .get(...params) as { count: number | bigint }
      ).count
    );
    const rows = this.database.connection
      .prepare(
        `SELECT document_type,document_id,novel_id,chapter_index,title,CASE WHEN document_type='novel' THEN title ELSE subtitle END novel_title,CASE WHEN length(content)>0 THEN snippet(search_documents,6,'<mark>','</mark>',' … ',28) ELSE highlight(search_documents,4,'<mark>','</mark>') END snippet,bm25(search_documents,0,0,0,0,12,5,1) rank FROM search_documents WHERE ${clause} ORDER BY rank ASC,document_type DESC,chapter_index ASC LIMIT ? OFFSET ?`
      )
      .all(...params, input.limit, input.offset) as Array<Record<string, unknown>>;
    const items: SearchResultItem[] = rows.map((r) => ({
      type: r.document_type as 'novel' | 'chapter',
      documentId: String(r.document_id),
      novelId: String(r.novel_id),
      novelTitle: String(r.novel_title),
      ...(r.chapter_index === null ? {} : { chapterIndex: Number(r.chapter_index) }),
      title: String(r.title),
      snippet: String(r.snippet ?? '')
    }));
    return { query: input.query, total, limit: input.limit, offset: input.offset, items };
  }
  async rebuild() {
    return this.database.transactionSync(() => {
      this.database.connection.exec(
        `DELETE FROM search_documents; INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content) SELECT 'novel',id,id,NULL,title,source_name,'' FROM novels; INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content) SELECT 'chapter',chapters.id,chapters.novel_id,chapters.chapter_index,chapters.title,novels.title,CASE WHEN chapters.status='fetched' THEN COALESCE(chapters.clean_text,chapters.raw_text,'') ELSE '' END FROM chapters JOIN novels ON novels.id=chapters.novel_id WHERE chapters.source_available=1;`
      );
      return Number(
        (
          this.database.connection.prepare('SELECT COUNT(*) count FROM search_documents').get() as {
            count: number | bigint;
          }
        ).count
      );
    });
  }
}
