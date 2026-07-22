import type { BackupSettings, BackupRestoreMode } from '../../domain/backup.js';

export type BackupSnapshot = {
  database: Buffer;
  settings: BackupSettings;
  covers: Array<{ path: string; content: Buffer }>;
};

export interface BackupStorePort {
  createSnapshot(settings: BackupSettings): Promise<BackupSnapshot>;
  restoreDatabase(database: Buffer, mode: BackupRestoreMode): Promise<Record<string, number>>;
  restoreCovers(
    covers: Array<{ path: string; content: Buffer }>,
    mode: BackupRestoreMode
  ): Promise<void>;
  saveSafetyBackup(content: Buffer, filename: string): Promise<string>;
}
