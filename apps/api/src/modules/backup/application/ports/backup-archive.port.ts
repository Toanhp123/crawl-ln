import type { BackupManifest, BackupSettings, BackupSnapshot } from '../../domain/backup.models.js';

export interface OpenedBackup {
  manifest: BackupManifest;
  database: Buffer;
  contributors: Record<string, unknown>;
  settings: BackupSettings;
}

export interface BackupArchiveCreateHooks {
  onStage?(stage: 'archiving' | 'encrypting'): void;
  throwIfCancelled?(): void;
}

export interface BackupArchivePort {
  create(
    snapshot: BackupSnapshot,
    password?: string,
    hooks?: BackupArchiveCreateHooks
  ): Promise<{ content: Buffer; manifest: BackupManifest }>;
  readManifest(content: Buffer): Promise<BackupManifest>;
  open(content: Buffer, password?: string): Promise<OpenedBackup>;
}
