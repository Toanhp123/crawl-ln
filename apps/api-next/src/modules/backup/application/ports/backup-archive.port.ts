import type { BackupManifest, BackupSettings, BackupSnapshot } from '../../domain/backup.models.js';

export interface OpenedBackup {
  manifest: BackupManifest;
  database: Buffer;
  contributors: Record<string, unknown>;
  settings: BackupSettings;
}

export interface BackupArchivePort {
  create(
    snapshot: BackupSnapshot,
    password?: string
  ): Promise<{ content: Buffer; manifest: BackupManifest }>;
  open(content: Buffer, password?: string): Promise<OpenedBackup>;
}
