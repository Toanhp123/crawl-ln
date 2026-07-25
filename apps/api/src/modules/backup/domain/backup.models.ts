export const CURRENT_BACKUP_SCHEMA_VERSION = 2;
export const MIN_SUPPORTED_BACKUP_SCHEMA_VERSION = 1;

export type BackupSettings = Record<string, unknown>;

export interface BackupManifest {
  format: 'novel-tool-backup';
  formatVersion: 3;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  encrypted: boolean;
  algorithm: 'none' | 'aes-256-gcm';
  checksumSha256: string;
  payloadSize: number;
}

export interface BackupSnapshot {
  database: Buffer;
  contributors: Record<string, unknown>;
  settings: BackupSettings;
}

export interface BackupArtifact {
  filename: string;
  contentType: 'application/vnd.novel-tool.backup';
  content: Buffer;
  encrypted: boolean;
}
