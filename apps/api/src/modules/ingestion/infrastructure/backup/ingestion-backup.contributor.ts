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

export const ingestionBackupTables = [
  'ingestion_jobs',
  'ingestion_job_chapters',
  'ingestion_events'
] as const;

export class IngestionBackupContributor implements BackupContributor {
  readonly module = 'ingestion';
  readonly fingerprintTables = ingestionBackupTables;

  constructor(private readonly database: SqliteDatabase) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve(exportSqliteTables(this.database.connection, ingestionBackupTables));
  }

  importMergeData(data: unknown, context: BackupImportContext): Promise<BackupContributorImpact> {
    const imported = importSqliteTables(this.database.connection, data, ingestionBackupTables, {
      transformRow: (table, row) => {
        if (table === 'ingestion_jobs') {
          const sourceId = String(row.id);
          const existing = this.database.connection
            .prepare('SELECT id FROM ingestion_jobs WHERE id = ?')
            .get(sourceId) as { id: string } | undefined;
          if (existing) {
            context.identities?.record('ingestion.job', sourceId, existing.id);
            return null;
          }
          const sourceNovelId = String(row.novel_id);
          const targetNovelId =
            context.identities?.resolve('library.novel', sourceNovelId) ??
            (context.identities ? undefined : sourceNovelId);
          return targetNovelId ? { ...row, novel_id: targetNovelId } : null;
        }

        const sourceJobId = String(row.job_id);
        const targetJobId =
          context.identities?.resolve('ingestion.job', sourceJobId) ??
          (context.identities ? undefined : sourceJobId);
        if (!targetJobId) return null;
        if (table === 'ingestion_job_chapters') {
          const sourceChapterId = String(row.chapter_id);
          const targetChapterId =
            context.identities?.resolve('library.chapter', sourceChapterId) ??
            (context.identities ? undefined : sourceChapterId);
          return targetChapterId
            ? { ...row, job_id: targetJobId, chapter_id: targetChapterId }
            : null;
        }

        const sourceChapterId = row.chapter_id == null ? undefined : String(row.chapter_id);
        const targetChapterId = sourceChapterId
          ? (context.identities?.resolve('library.chapter', sourceChapterId) ??
            (context.identities ? undefined : sourceChapterId))
          : null;
        return { ...row, job_id: targetJobId, chapter_id: targetChapterId ?? null };
      },
      afterRow: (table, sourceRow, importedRow, changes) => {
        if (table === 'ingestion_jobs' && changes > 0) {
          context.identities?.record('ingestion.job', String(sourceRow.id), String(importedRow.id));
        }
      }
    });

    const rowsSkipped = Object.values(imported.skippedByTable).reduce(
      (total, value) => total + value,
      0
    );
    return Promise.resolve({
      module: this.module,
      counts: {
        tasksAdded: imported.insertedByTable.ingestion_jobs ?? 0,
        taskChaptersAdded: imported.insertedByTable.ingestion_job_chapters ?? 0,
        eventsAdded: imported.insertedByTable.ingestion_events ?? 0,
        rowsSkipped
      }
    });
  }
}
