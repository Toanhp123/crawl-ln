import type { BackupContributor } from '../../platform/backup/backup-contributor.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';
import { CreateBackupCommandHandler } from './application/commands/create-backup.command.js';
import { RestoreBackupCommandHandler } from './application/commands/restore-backup.command.js';
import type { BackupMaintenancePort } from './application/ports/backup-maintenance.port.js';
import { BackupContributorCoordinator } from './application/services/backup-contributor-coordinator.js';
import { JsZipBackupArchive } from './infrastructure/archive/jszip-backup.archive.js';
import { SqliteBackupStore } from './infrastructure/sqlite/sqlite-backup.store.js';
import type { BackupApi } from './public/backup.api.js';

interface BackupModuleOptions {
  database: SqliteDatabase;
  databasePath: string;
  storageDirectory: string;
  contributors: readonly BackupContributor[];
  clock: { now(): Date };
  appVersion: string;
  schemaVersion: number;
  maintenance?: BackupMaintenancePort;
}

export function createBackupModule(options: BackupModuleOptions) {
  const store = new SqliteBackupStore(
    options.database,
    options.databasePath,
    options.storageDirectory
  );
  const contributors = new BackupContributorCoordinator(options.contributors);
  const archive = new JsZipBackupArchive({
    appVersion: options.appVersion,
    schemaVersion: options.schemaVersion
  });
  const create = new CreateBackupCommandHandler(store, contributors, archive, options.clock);
  const restore = new RestoreBackupCommandHandler(
    store,
    contributors,
    archive,
    options.clock,
    options.maintenance ?? { runExclusive: (work) => work() }
  );
  const api: BackupApi = {
    commands: {
      create: (input) => create.execute(input),
      restore: (input) => restore.execute(input)
    }
  };

  return { name: 'backup', migrations: [], api };
}

export type BackupModule = ReturnType<typeof createBackupModule>;
