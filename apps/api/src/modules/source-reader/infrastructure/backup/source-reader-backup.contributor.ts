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

export const sourceReaderBackupTables = [
  'source_reader_plugins',
  'source_reader_plugin_versions',
  'source_reader_plugin_permissions',
  'source_reader_credentials',
  'source_reader_network_profiles',
  'source_reader_sessions',
  'source_reader_auth_challenges',
  'source_reader_cache_entries',
  'source_reader_cache_tags',
  'source_reader_installations',
  'source_reader_health_checks'
] as const;

export class SourceReaderBackupContributor implements BackupContributor {
  readonly module = 'source-reader';
  readonly fingerprintTables = sourceReaderBackupTables;

  constructor(private readonly database: SqliteDatabase) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve(exportSqliteTables(this.database.connection, sourceReaderBackupTables));
  }

  importMergeData(data: unknown, _context: BackupImportContext): Promise<BackupContributorImpact> {
    const imported = importSqliteTables(this.database.connection, data, sourceReaderBackupTables);
    return Promise.resolve({
      module: this.module,
      counts: {
        pluginsAdded: imported.insertedByTable.source_reader_plugins ?? 0,
        credentialsAdded: imported.insertedByTable.source_reader_credentials ?? 0,
        networkProfilesAdded: imported.insertedByTable.source_reader_network_profiles ?? 0,
        rowsSkipped: Object.values(imported.skippedByTable).reduce(
          (total, value) => total + value,
          0
        )
      }
    });
  }
}
