import type { BackupManifest, BackupSettings } from '../../domain/backup.js';
import type { BackupSnapshot } from './backup-store.port.js';

export type OpenedBackup = {
  manifest: BackupManifest;
  database: Buffer;
  settings: BackupSettings;
  covers: Array<{ path: string; content: Buffer }>;
};

export interface BackupArchivePort {
  create(
    snapshot: BackupSnapshot,
    password?: string
  ): Promise<{ content: Buffer; manifest: BackupManifest }>;
  open(content: Buffer, password?: string): Promise<OpenedBackup>;
}
