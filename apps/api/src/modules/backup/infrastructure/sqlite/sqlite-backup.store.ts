import { randomUUID } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { BackupBadRequestError } from '../../application/errors/backup.error.js';
import type {
  BackupStorePort,
  ReplacePromotionPaths
} from '../../application/ports/backup-store.port.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';

function sqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateDatabase(path: string): void {
  let candidate: DatabaseSync | undefined;
  try {
    candidate = new DatabaseSync(path, { readOnly: true });
    const integrity = candidate.prepare('PRAGMA integrity_check').get() as
      { integrity_check?: string } | undefined;
    if (integrity?.integrity_check !== 'ok') {
      throw new BackupBadRequestError('Backup database integrity check failed');
    }
    if (candidate.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new BackupBadRequestError('Backup database foreign key check failed');
    }
    const migrations = candidate
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'platform_module_migrations'"
      )
      .get();
    if (!migrations) throw new BackupBadRequestError('Backup database schema is invalid');
  } catch (error) {
    if (error instanceof BackupBadRequestError) throw error;
    throw new BackupBadRequestError('Invalid backup database snapshot', error);
  } finally {
    candidate?.close();
  }
}

async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (!['EPERM', 'EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP'].includes(String(code))) throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export class SqliteBackupStore implements BackupStorePort {
  private readonly databasePath: string;
  private readonly storageDirectory: string;

  constructor(
    private readonly database: SqliteDatabase,
    databasePath: string,
    storageDirectory: string
  ) {
    this.databasePath = databasePath === ':memory:' ? databasePath : resolve(databasePath);
    this.storageDirectory = resolve(storageDirectory);
  }

  async createDatabaseSnapshot(): Promise<Buffer> {
    const directory =
      this.databasePath === ':memory:' ? this.storageDirectory : dirname(this.databasePath);
    await mkdir(directory, { recursive: true });
    const snapshotPath = join(directory, `.backup-snapshot-${randomUUID()}.sqlite`);
    try {
      this.database.connection.exec(`VACUUM INTO ${sqliteString(snapshotPath)}`);
      return await readFile(snapshotPath);
    } finally {
      await rm(snapshotPath, { force: true });
    }
  }

  async replaceDatabase(content: Buffer): Promise<void> {
    if (this.databasePath === ':memory:') {
      throw new BackupBadRequestError('In-memory databases cannot be replaced');
    }

    await mkdir(dirname(this.databasePath), { recursive: true });
    const stagingPath = `${this.databasePath}.restore-${randomUUID()}`;
    const previousPath = `${this.databasePath}.previous-${randomUUID()}`;
    let originalMoved = false;
    let stagingPromoted = false;

    try {
      await writeFile(stagingPath, content, { flag: 'wx' });
      validateDatabase(stagingPath);

      this.database.close();
      if (existsSync(this.databasePath)) {
        await rename(this.databasePath, previousPath);
        originalMoved = true;
      }
      await rename(stagingPath, this.databasePath);
      stagingPromoted = true;
      this.database.open();
      validateDatabase(this.databasePath);
      if (originalMoved) await rm(previousPath, { force: true });
      originalMoved = false;
    } catch (error) {
      if (originalMoved || stagingPromoted) {
        try {
          this.database.close();
          if (stagingPromoted) await rm(this.databasePath, { force: true });
          if (originalMoved && existsSync(previousPath)) {
            await rename(previousPath, this.databasePath);
          }
          this.database.open();
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'Backup database replacement failed');
        }
      }
      throw error;
    } finally {
      await rm(stagingPath, { force: true });
    }
  }

  async saveSafetyBackup(content: Buffer, filename: string): Promise<string> {
    const directory = join(this.storageDirectory, 'backups');
    await mkdir(directory, { recursive: true });
    const path = join(directory, filename);
    await writeFile(path, content, { flag: 'wx' });
    return path;
  }

  runMergeTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transactionAsync(work);
  }

  primaryDatabasePath(): string {
    if (this.databasePath === ':memory:') {
      throw new BackupBadRequestError('In-memory databases cannot be replaced');
    }
    return this.databasePath;
  }

  async prepareReplacement(input: {
    operationId: string;
    validatedDatabasePath: string;
  }): Promise<ReplacePromotionPaths> {
    const databasePath = this.primaryDatabasePath();
    const paths: ReplacePromotionPaths = {
      databasePath,
      newDatabasePath: `${databasePath}.restore-${input.operationId}.new`,
      rollbackDatabasePath: `${databasePath}.restore-${input.operationId}.rollback`
    };
    await mkdir(dirname(databasePath), { recursive: true });
    await rm(paths.newDatabasePath, { force: true });
    await rm(paths.rollbackDatabasePath, { force: true });
    await copyFile(input.validatedDatabasePath, paths.newDatabasePath, constants.COPYFILE_EXCL);
    await fsyncFile(paths.newDatabasePath);
    await fsyncDirectory(dirname(databasePath));
    validateDatabase(paths.newDatabasePath);
    return paths;
  }

  closePrimaryDatabase(): void {
    this.database.close();
  }

  openPrimaryDatabase(): void {
    this.database.open();
  }

  validateDatabaseFile(path: string): void {
    validateDatabase(path);
  }

  fileExists(path: string): boolean {
    return existsSync(path);
  }

  async movePrimaryToRollback(paths: ReplacePromotionPaths): Promise<void> {
    if (!existsSync(paths.databasePath)) {
      throw new BackupBadRequestError('Primary database is missing during Replace');
    }
    await rename(paths.databasePath, paths.rollbackDatabasePath);
    await fsyncDirectory(dirname(paths.databasePath));
  }

  async promotePreparedDatabase(paths: ReplacePromotionPaths): Promise<void> {
    await rename(paths.newDatabasePath, paths.databasePath);
    await fsyncDirectory(dirname(paths.databasePath));
  }

  async restoreRollbackDatabase(paths: ReplacePromotionPaths): Promise<void> {
    this.database.close();
    await rm(paths.databasePath, { force: true });
    if (!existsSync(paths.rollbackDatabasePath)) {
      throw new BackupBadRequestError('Rollback database is unavailable');
    }
    await rename(paths.rollbackDatabasePath, paths.databasePath);
    await rm(paths.newDatabasePath, { force: true });
    await fsyncDirectory(dirname(paths.databasePath));
    this.database.open();
    validateDatabase(paths.databasePath);
  }

  async removeDatabaseFile(path: string): Promise<void> {
    await rm(path, { force: true });
  }

  async cleanupReplacement(paths: ReplacePromotionPaths): Promise<void> {
    await Promise.all([
      rm(paths.newDatabasePath, { force: true }),
      rm(paths.rollbackDatabasePath, { force: true })
    ]);
  }
}
