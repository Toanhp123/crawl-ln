import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class SqliteDatabase {
  private database?: DatabaseSync;

  constructor(
    private readonly path: string,
    options: { open?: boolean } = {}
  ) {
    if (options.open ?? true) this.open();
  }

  get connection(): DatabaseSync {
    if (!this.database) throw new Error('SQLite database is not open');
    return this.database;
  }

  open(): void {
    if (this.database) return;
    if (this.path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true });
    this.database = new DatabaseSync(this.path);
    this.database.exec('PRAGMA foreign_keys = ON;');
  }

  transactionSync<T>(work: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE;');
    try {
      const result = work();
      this.connection.exec('COMMIT;');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK;');
      throw error;
    }
  }

  close(): void {
    if (!this.database) return;
    this.database.close();
    this.database = undefined;
  }
}
