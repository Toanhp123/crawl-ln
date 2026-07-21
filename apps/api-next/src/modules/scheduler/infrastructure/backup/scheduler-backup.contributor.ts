import type {
  BackupContributor,
  BackupImportContext
} from '../../../../platform/backup/backup-contributor.js';
import {
  exportSqliteTables,
  importSqliteTables
} from '../../../../platform/backup/sqlite-table-snapshot.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';

export const schedulerBackupTables = ['scheduler_policies', 'scheduler_diagnostics'] as const;

export class SchedulerBackupContributor implements BackupContributor {
  readonly module = 'scheduler';

  constructor(private readonly database: SqliteDatabase) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve(exportSqliteTables(this.database.connection, schedulerBackupTables));
  }

  importMergeData(data: unknown, context: BackupImportContext): Promise<void> {
    this.database.transactionSync(() => {
      importSqliteTables(this.database.connection, data, schedulerBackupTables, {
        transformRow: (_table, row) => {
          const sourceNovelId = String(row.novel_id);
          const targetNovelId =
            context.identities?.resolve('library.novel', sourceNovelId) ??
            (context.identities ? undefined : sourceNovelId);
          return targetNovelId ? { ...row, novel_id: targetNovelId } : null;
        }
      });
    });
    return Promise.resolve();
  }
}
