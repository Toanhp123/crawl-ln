import type { BackupOperationRecord } from '../domain/backup-operation.models.js';
import type { BackupArtifact, BackupSettings } from '../domain/backup.models.js';

export interface CreateBackupInput {
  password?: string;
  settings?: BackupSettings;
}

export type StartBackupOperationInput = {
  idempotencyKey: string;
  requestFingerprint: string;
  encryption: { enabled: true; password: string } | { enabled: false };
  confirmation: { unencryptedAccepted: boolean };
  settings: BackupSettings;
};

export type StartRestoreOperationInput = {
  sessionId: string;
  sessionToken: string;
  inspectionToken: string;
  planFingerprint: string;
  idempotencyKey: string;
  confirmation: { accepted: boolean; typedPhrase?: string };
  currentSettings: Record<string, unknown>;
};

export type BackupOperationView = BackupOperationRecord;

export interface BackupDownload {
  filename: string;
  sizeBytes: number;
  stream: NodeJS.ReadableStream;
}

export interface BackupCommands {
  create(input?: CreateBackupInput): Promise<BackupArtifact>;
}

export interface BackupOperations {
  startBackup(input: StartBackupOperationInput): BackupOperationRecord;
  startRestore(input: StartRestoreOperationInput): BackupOperationRecord;
  current(): BackupOperationRecord | null;
  read(operationId: string): BackupOperationRecord;
  cancel(operationId: string): BackupOperationRecord;
  issueDownloadToken(
    operationId: string,
    artifactId: string
  ): Promise<{ token: string; expiresAt: string }>;
  acceptDownloadToken(token: string): BackupDownload;
}

export interface BackupApi {
  commands: BackupCommands;
  operations: BackupOperations;
}

export type { BackupArtifact, BackupSettings } from '../domain/backup.models.js';
