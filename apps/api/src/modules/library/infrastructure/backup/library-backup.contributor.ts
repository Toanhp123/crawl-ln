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

export const libraryBackupTables = ['library_novels', 'library_chapters'] as const;

export class LibraryBackupContributor implements BackupContributor {
  readonly module = 'library';
  readonly fingerprintTables = libraryBackupTables;

  constructor(private readonly database: SqliteDatabase) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve(exportSqliteTables(this.database.connection, libraryBackupTables));
  }

  importMergeData(data: unknown, context: BackupImportContext): Promise<BackupContributorImpact> {
    let novelRemaps = 0;
    let chapterRemaps = 0;
    const imported = importSqliteTables(this.database.connection, data, libraryBackupTables, {
      transformRow: (table, row) => {
        if (table === 'library_novels') {
          const sourceId = String(row.id);
          const existingBySource = this.database.connection
            .prepare('SELECT id FROM library_novels WHERE source_url = ?')
            .get(row.source_url) as { id: string } | undefined;
          const existingById = this.database.connection
            .prepare('SELECT id FROM library_novels WHERE id = ?')
            .get(sourceId) as { id: string } | undefined;
          const existing = existingBySource ?? existingById;
          if (existing) {
            context.identities?.record('library.novel', sourceId, existing.id);
            if (existing.id !== sourceId) novelRemaps += 1;
            return null;
          }
          return row;
        }

        const sourceId = String(row.id);
        const sourceNovelId = String(row.novel_id);
        const targetNovelId =
          context.identities?.resolve('library.novel', sourceNovelId) ??
          (context.identities ? undefined : sourceNovelId);
        if (!targetNovelId) return null;
        const existingBySource = this.database.connection
          .prepare('SELECT id FROM library_chapters WHERE novel_id = ? AND source_url = ?')
          .get(targetNovelId, row.source_url) as { id: string } | undefined;
        const existingById = this.database.connection
          .prepare('SELECT id FROM library_chapters WHERE id = ?')
          .get(sourceId) as { id: string } | undefined;
        const existing = existingBySource ?? existingById;
        if (existing) {
          context.identities?.record('library.chapter', sourceId, existing.id);
          if (existing.id !== sourceId) chapterRemaps += 1;
          return null;
        }
        return { ...row, novel_id: targetNovelId };
      },
      afterRow: (table, sourceRow, importedRow, changes) => {
        if (changes === 0) return;
        if (table === 'library_novels') {
          context.identities?.record('library.novel', String(sourceRow.id), String(importedRow.id));
        } else {
          context.identities?.record(
            'library.chapter',
            String(sourceRow.id),
            String(importedRow.id)
          );
        }
      }
    });

    return Promise.resolve({
      module: this.module,
      counts: {
        novelsAdded: imported.insertedByTable.library_novels ?? 0,
        novelsSkipped: imported.skippedByTable.library_novels ?? 0,
        chaptersAdded: imported.insertedByTable.library_chapters ?? 0,
        chaptersSkipped: imported.skippedByTable.library_chapters ?? 0,
        novelRemaps,
        chapterRemaps
      }
    });
  }
}
