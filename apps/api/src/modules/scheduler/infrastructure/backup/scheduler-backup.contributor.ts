import type {
  BackupContributor,
  BackupContributorImpact,
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
  readonly fingerprintTables = schedulerBackupTables;

  constructor(private readonly database: SqliteDatabase) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve(exportSqliteTables(this.database.connection, schedulerBackupTables));
  }

  importMergeData(data: unknown, context: BackupImportContext): Promise<BackupContributorImpact> {
    const imported = importSqliteTables(this.database.connection, data, schedulerBackupTables, {
      transformRow: (_table, row) => {
        const sourceNovelId = String(row.novel_id);
        const targetNovelId =
          context.identities?.resolve('library.novel', sourceNovelId) ??
          (context.identities ? undefined : sourceNovelId);
        return targetNovelId ? { ...row, novel_id: targetNovelId } : null;
      }
    });
    return Promise.resolve({
      module: this.module,
      counts: {
        policiesAdded: imported.insertedByTable.scheduler_policies ?? 0,
        diagnosticsAdded: imported.insertedByTable.scheduler_diagnostics ?? 0,
        rowsSkipped: Object.values(imported.skippedByTable).reduce(
          (total, value) => total + value,
          0
        )
      }
    });
  }
}
