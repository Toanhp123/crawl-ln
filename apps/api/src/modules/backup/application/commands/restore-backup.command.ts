import { randomUUID } from 'node:crypto';
import type {
  BackupRestoreMode,
  BackupSettings,
  BackupSettingsMode,
  RestoreResult
} from '../../domain/backup.models.js';
import type { BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupMaintenancePort } from '../ports/backup-maintenance.port.js';
import type { BackupStorePort } from '../ports/backup-store.port.js';
import type { BackupContributorCoordinator } from '../services/backup-contributor-coordinator.js';

export class RestoreBackupCommandHandler {
  constructor(
    private readonly store: BackupStorePort,
    private readonly contributors: BackupContributorCoordinator,
    private readonly archive: BackupArchivePort,
    private readonly clock: { now(): Date },
    private readonly maintenance: BackupMaintenancePort
  ) {}

  async execute(input: {
    content: Buffer;
    password?: string;
    mode: BackupRestoreMode;
    settingsMode: BackupSettingsMode;
    currentSettings?: BackupSettings;
  }): Promise<RestoreResult> {
    return this.maintenance.runExclusive(async () => {
      const password = input.password?.trim() || undefined;
      const opened = await this.archive.open(input.content, password);

      if (input.mode === 'merge') {
        const rollbackSnapshot = await this.store.createDatabaseSnapshot();
        let restored: Record<string, number>;
        try {
          restored = await this.contributors.importAll(opened.contributors, {
            importId: `backup:${randomUUID()}`
          });
        } catch (error) {
          await this.store.replaceDatabase(rollbackSnapshot);
          throw error;
        }
        return {
          mode: input.mode,
          restored,
          settings: input.settingsMode === 'use-backup' ? opened.settings : null,
          safetyBackupPath: null
        };
      }

      const current = {
        database: await this.store.createDatabaseSnapshot(),
        contributors: await this.contributors.exportAll(),
        settings: input.currentSettings ?? {}
      };
      const safety = await this.archive.create(current, password);
      const stamp = this.clock.now().toISOString().replace(/[:.]/g, '-');
      const safetyBackupPath = await this.store.saveSafetyBackup(
        safety.content,
        `pre-restore-${stamp}.nvt`
      );
      await this.store.replaceDatabase(opened.database);

      return {
        mode: input.mode,
        restored: { database: 1 },
        settings: input.settingsMode === 'use-backup' ? opened.settings : null,
        safetyBackupPath
      };
    });
  }
}
