import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { BackupRestoreMode, BackupSettingsMode, RestoreResult } from '../../domain/backup.js';
import type { BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupStorePort } from '../ports/backup-store.port.js';
import type { BackupMaintenancePort } from '../ports/backup-maintenance.port.js';

export class RestoreBackupUseCase {
  constructor(
    private readonly store: BackupStorePort,
    private readonly archive: BackupArchivePort,
    private readonly clock: ClockPort,
    private readonly maintenance: BackupMaintenancePort = { runExclusive: (work) => work() }
  ) {}

  async execute(input: {
    content: Buffer;
    password?: string;
    mode: BackupRestoreMode;
    settingsMode: BackupSettingsMode;
    currentSettings?: Record<string, unknown>;
  }): Promise<RestoreResult> {
    return this.maintenance.runExclusive(async () => {
      const opened = await this.archive.open(input.content, input.password?.trim() || undefined);
      let safetyBackupPath: string | null = null;
      const current =
        input.mode === 'replace'
          ? await this.store.createSnapshot(input.currentSettings ?? {})
          : null;
      if (current) {
        const safety = await this.archive.create(current, input.password?.trim() || undefined);
        const stamp = this.clock.now().toISOString().replace(/[:.]/g, '-');
        safetyBackupPath = await this.store.saveSafetyBackup(
          safety.content,
          `pre-restore-${stamp}.nvt`
        );
      }

      let restored: Record<string, number>;
      try {
        restored = await this.store.restoreDatabase(opened.database, input.mode);
        await this.store.restoreCovers(opened.covers, input.mode);
      } catch (error) {
        if (current) {
          await this.store.restoreDatabase(current.database, 'replace');
          await this.store.restoreCovers(current.covers, 'replace');
        }
        throw error;
      }
      return {
        mode: input.mode,
        restored,
        settings: input.settingsMode === 'use-backup' ? opened.settings : null,
        safetyBackupPath
      };
    });
  }
}
