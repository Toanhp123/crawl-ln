import type {
  BackupArtifact,
  BackupRestoreMode,
  BackupSettings,
  BackupSettingsMode,
  RestoreResult
} from '../domain/backup.models.js';

export interface CreateBackupInput {
  password?: string;
  settings?: BackupSettings;
}

export interface RestoreBackupInput {
  content: Buffer;
  password?: string;
  mode: BackupRestoreMode;
  settingsMode: BackupSettingsMode;
  currentSettings?: BackupSettings;
}

export interface BackupCommands {
  create(input?: CreateBackupInput): Promise<BackupArtifact>;
  restore(input: RestoreBackupInput): Promise<RestoreResult>;
}

export interface BackupApi {
  commands: BackupCommands;
}

export type {
  BackupArtifact,
  BackupRestoreMode,
  BackupSettings,
  BackupSettingsMode,
  RestoreResult
} from '../domain/backup.models.js';
