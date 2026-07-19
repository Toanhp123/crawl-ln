export type BackupRestoreMode = 'replace' | 'merge';
export type BackupSettingsMode = 'keep-current' | 'use-backup';

export type BackupManifest = {
  format: 'novel-tool-backup';
  formatVersion: 1 | 2;
  appVersion: string;
  schemaVersion?: number;
  minimumAppVersion?: string;
  createdAt: string;
  encrypted: boolean;
  algorithm: 'none' | 'aes-256-gcm';
  checksumSha256: string;
  payloadSize: number;
};

export type BackupSettings = Record<string, unknown>;

export type BackupArtifact = {
  filename: string;
  contentType: 'application/vnd.novel-tool.backup';
  content: Buffer;
  encrypted: boolean;
};

export type RestoreResult = {
  mode: BackupRestoreMode;
  restored: Record<string, number>;
  settings: BackupSettings | null;
  safetyBackupPath: string | null;
};
