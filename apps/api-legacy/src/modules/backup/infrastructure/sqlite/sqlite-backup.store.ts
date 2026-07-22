import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { SqliteDatabase } from '../../../../shared/database/sqlite.js';
import type { BackupRestoreMode, BackupSettings } from '../../domain/backup.js';
import type { BackupSnapshot, BackupStorePort } from '../../application/ports/backup-store.port.js';

const TABLES = [
  'novels',
  'chapters',
  'crawl_tasks',
  'crawl_events',
  'novel_update_diagnostics'
] as const;
const DELETE_ORDER = [...TABLES].reverse();

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeRestoredTask(row: Record<string, unknown>): Record<string, unknown> {
  const active = new Set(['queued', 'running', 'pausing', 'resuming']);
  return active.has(String(row.status))
    ? { ...row, status: 'paused', outcome: null, finished_at: null }
    : row;
}

function listFiles(root: string): Array<{ path: string; content: Buffer }> {
  try {
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = join(entry.parentPath, entry.name);
        return {
          path: relative(root, fullPath).replaceAll('\\', '/'),
          content: readFileSync(fullPath)
        };
      });
  } catch {
    return [];
  }
}

function tableColumns(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}

export class SqliteBackupStore implements BackupStorePort {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly databasePath: string,
    private readonly storageDir: string
  ) {}

  async createSnapshot(settings: BackupSettings): Promise<BackupSnapshot> {
    const tempPath = join(tmpdir(), `novel-tool-backup-${randomUUID()}.sqlite`);
    try {
      this.database.connection.exec('PRAGMA wal_checkpoint(FULL);');
      this.database.connection.exec(`VACUUM INTO ${sqlString(tempPath)};`);
      return {
        database: readFileSync(tempPath),
        settings,
        covers: listFiles(resolve(this.storageDir, 'covers'))
      };
    } finally {
      rmSync(tempPath, { force: true });
    }
  }

  async restoreDatabase(content: Buffer, mode: BackupRestoreMode): Promise<Record<string, number>> {
    const tempPath = join(tmpdir(), `novel-tool-restore-${randomUUID()}.sqlite`);
    writeFileSync(tempPath, content);
    const source = new SqliteDatabase(tempPath);
    try {
      source.migrate();
      const integrity = source.connection.prepare('PRAGMA integrity_check').get() as
        { integrity_check?: string } | undefined;
      if (integrity?.integrity_check !== 'ok')
        throw new Error('Backup database integrity check failed');
      const foreignKeyErrors = source.connection.prepare('PRAGMA foreign_key_check').all();
      if (foreignKeyErrors.length > 0)
        throw new Error('Backup database contains invalid foreign keys');

      if (mode === 'replace') {
        return this.database.transactionSync(() => {
          for (const table of DELETE_ORDER)
            this.database.connection.exec(`DELETE FROM ${quoteIdentifier(table)};`);
          const restored: Record<string, number> = {};
          for (const table of TABLES)
            restored[table] = this.copyRows(
              source.connection,
              table,
              'INSERT',
              table === 'crawl_tasks' ? normalizeRestoredTask : undefined
            );
          return restored;
        });
      }

      return this.database.transactionSync(() => this.mergeRows(source.connection));
    } finally {
      source.close();
      rmSync(tempPath, { force: true });
    }
  }

  private copyRows(
    source: DatabaseSync,
    table: (typeof TABLES)[number],
    verb: 'INSERT' | 'INSERT OR IGNORE',
    transform?: (row: Record<string, unknown>) => Record<string, unknown> | null
  ): number {
    const sourceColumns = tableColumns(source, table);
    const targetColumns = new Set(tableColumns(this.database.connection, table));
    const columns = sourceColumns.filter((column) => targetColumns.has(column));
    if (columns.length === 0) return 0;
    const rows = source
      .prepare(`SELECT ${columns.map(quoteIdentifier).join(',')} FROM ${quoteIdentifier(table)}`)
      .all() as Array<Record<string, unknown>>;
    const statement = this.database.connection.prepare(
      `${verb} INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(',')}) VALUES (${columns.map(() => '?').join(',')})`
    );
    let count = 0;
    for (const original of rows) {
      const row = transform ? transform(original) : original;
      if (!row) continue;
      const result = statement.run(
        ...columns.map((column) => row[column] as string | number | bigint | null)
      );
      count += Number(result.changes);
    }
    return count;
  }

  private mergeRows(source: DatabaseSync): Record<string, number> {
    const restored: Record<string, number> = Object.fromEntries(TABLES.map((table) => [table, 0]));
    const novelIds = new Map<string, string>();
    const chapterIds = new Map<string, string>();
    const taskIds = new Map<string, string>();

    const novelRows = source.prepare('SELECT * FROM novels ORDER BY created_at, id').all() as Array<
      Record<string, unknown>
    >;
    const novelColumns = tableColumns(source, 'novels').filter((column) =>
      new Set(tableColumns(this.database.connection, 'novels')).has(column)
    );
    const insertNovel = this.database.connection.prepare(
      `INSERT INTO novels (${novelColumns.map(quoteIdentifier).join(',')}) VALUES (${novelColumns.map(() => '?').join(',')})`
    );
    for (const row of novelRows) {
      const sourceId = String(row.id);
      const existing = this.database.connection
        .prepare('SELECT id FROM novels WHERE source_url = ?')
        .get(String(row.source_url)) as { id: string } | undefined;
      if (existing) {
        novelIds.set(sourceId, existing.id);
        continue;
      }
      insertNovel.run(
        ...novelColumns.map((column) => row[column] as string | number | bigint | null)
      );
      novelIds.set(sourceId, sourceId);
      restored.novels += 1;
    }

    const chapterRows = source
      .prepare('SELECT * FROM chapters ORDER BY novel_id, chapter_index, id')
      .all() as Array<Record<string, unknown>>;
    const chapterColumns = tableColumns(source, 'chapters').filter((column) =>
      new Set(tableColumns(this.database.connection, 'chapters')).has(column)
    );
    const insertChapter = this.database.connection.prepare(
      `INSERT INTO chapters (${chapterColumns.map(quoteIdentifier).join(',')}) VALUES (${chapterColumns.map(() => '?').join(',')})`
    );
    for (const original of chapterRows) {
      const row: Record<string, unknown> = {
        ...original,
        novel_id: novelIds.get(String(original.novel_id))
      };
      if (!row.novel_id) continue;
      const existing = this.database.connection
        .prepare('SELECT id FROM chapters WHERE novel_id = ? AND source_url = ?')
        .get(String(row.novel_id), String(row.source_url)) as { id: string } | undefined;
      if (existing) {
        chapterIds.set(String(original.id), existing.id);
        continue;
      }
      insertChapter.run(
        ...chapterColumns.map((column) => row[column] as string | number | bigint | null)
      );
      chapterIds.set(String(original.id), String(original.id));
      restored.chapters += 1;
    }

    restored.crawl_tasks = this.copyRows(source, 'crawl_tasks', 'INSERT OR IGNORE', (input) => {
      const row = normalizeRestoredTask(input);
      const mappedNovelId = novelIds.get(String(row.novel_id));
      if (!mappedNovelId) return null;
      let chapterIdsJson = row.chapter_ids_json;
      if (typeof chapterIdsJson === 'string') {
        try {
          const ids = JSON.parse(chapterIdsJson) as unknown[];
          chapterIdsJson = JSON.stringify(
            ids.map((id) => chapterIds.get(String(id))).filter(Boolean)
          );
        } catch {
          chapterIdsJson = '[]';
        }
      }
      return { ...row, novel_id: mappedNovelId, chapter_ids_json: chapterIdsJson };
    });
    for (const row of source.prepare('SELECT id FROM crawl_tasks').all() as Array<{ id: string }>) {
      const existing = this.database.connection
        .prepare('SELECT id FROM crawl_tasks WHERE id = ?')
        .get(row.id) as { id: string } | undefined;
      if (existing) taskIds.set(row.id, existing.id);
    }
    restored.crawl_events = this.copyRows(source, 'crawl_events', 'INSERT OR IGNORE', (row) => {
      const mappedTaskId = taskIds.get(String(row.task_id));
      if (!mappedTaskId) return null;
      return {
        ...row,
        task_id: mappedTaskId,
        chapter_id: row.chapter_id == null ? null : (chapterIds.get(String(row.chapter_id)) ?? null)
      };
    });
    restored.novel_update_diagnostics = this.copyRows(
      source,
      'novel_update_diagnostics',
      'INSERT OR IGNORE',
      (row) => ({ ...row, novel_id: novelIds.get(String(row.novel_id)) ?? row.novel_id })
    );
    return restored;
  }

  async restoreCovers(
    covers: Array<{ path: string; content: Buffer }>,
    mode: BackupRestoreMode
  ): Promise<void> {
    const root = resolve(this.storageDir, 'covers');
    if (mode === 'replace') rmSync(root, { recursive: true, force: true });
    for (const cover of covers) {
      const destination = resolve(root, cover.path);
      const relativePath = relative(root, destination);
      if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath))
        continue;
      mkdirSync(dirname(destination), { recursive: true });
      if (mode === 'merge') {
        try {
          readFileSync(destination);
          continue;
        } catch {
          /* missing */
        }
      }
      writeFileSync(destination, cover.content);
    }
  }

  async saveSafetyBackup(content: Buffer, filename: string): Promise<string> {
    const directory = resolve(this.storageDir, 'backups');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, basename(filename));
    writeFileSync(path, content);
    return path;
  }
}
