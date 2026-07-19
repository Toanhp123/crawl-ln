import type { NovelDeletionPort } from '../../application/ports/novel-deletion.port.js';
import type { SqliteDatabase } from '../../../../shared/database/sqlite.js';

export class NovelDeletionSqliteAdapter implements NovelDeletionPort {
  constructor(private readonly database: SqliteDatabase) {}

  async delete(id: string): Promise<void> {
    this.database.transactionSync(() => {
      this.database.connection.prepare('DELETE FROM chapters WHERE novel_id = ?').run(id);
      this.database.connection.prepare('DELETE FROM crawl_tasks WHERE novel_id = ?').run(id);
      this.database.connection.prepare('DELETE FROM novels WHERE id = ?').run(id);
    });
  }
}
