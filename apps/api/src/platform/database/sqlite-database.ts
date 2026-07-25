import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class SqliteDatabase {
  private database?: DatabaseSync;
  private asyncTransactionActive = false;
  private savepointSequence = 0;

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

  async transactionAsync<T>(work: () => Promise<T>): Promise<T> {
    if (this.asyncTransactionActive) {
      throw new Error('Nested async SQLite transactions are not supported');
    }
    this.connection.exec('BEGIN IMMEDIATE;');
    this.asyncTransactionActive = true;
    try {
      const result = await work();
      this.connection.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        this.connection.exec('ROLLBACK;');
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'SQLite transaction rollback failed');
      }
      throw error;
    } finally {
      this.asyncTransactionActive = false;
    }
  }

  async rollbackOnlySavepoint<T>(label: string, work: () => Promise<T>): Promise<T> {
    if (!this.asyncTransactionActive) {
      throw new Error('Rollback-only savepoints require an active async SQLite transaction');
    }
    const safeLabel = label
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    const name = `sp_${++this.savepointSequence}_${safeLabel || 'restore'}`;
    this.connection.exec(`SAVEPOINT "${name}";`);

    let result: T | undefined;
    let workError: unknown;
    try {
      result = await work();
    } catch (error) {
      workError = error;
    }

    try {
      this.connection.exec(`ROLLBACK TO SAVEPOINT "${name}";`);
      this.connection.exec(`RELEASE SAVEPOINT "${name}";`);
    } catch (rollbackError) {
      if (workError !== undefined) {
        throw new AggregateError(
          [workError, rollbackError],
          'SQLite rollback-only savepoint cleanup failed'
        );
      }
      throw rollbackError;
    }

    if (workError !== undefined) throw workError;
    return result as T;
  }

  close(): void {
    if (!this.database) return;
    this.database.close();
    this.database = undefined;
    this.asyncTransactionActive = false;
  }
}
