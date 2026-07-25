export type BackupOperationKind = 'backup' | 'restore';
export type BackupOperationMode = 'merge' | 'replace' | null;
export type BackupOperationState =
  'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled';
export type BackupArtifactKind = 'user-backup' | 'safety-backup';

export interface StartOperationInput {
  idempotencyKey: string;
  requestFingerprint: string;
  kind: BackupOperationKind;
  mode?: Exclude<BackupOperationMode, null>;
  initialStage: string;
  progressTotal: number;
}

export interface BackupOperationTransitionInput {
  state?: BackupOperationState;
  stage: string;
  progressCurrent?: number;
  progressTotal?: number;
  cancellable: boolean;
  errorCode?: string | null;
  errorDetails?: Record<string, unknown> | null;
  resultArtifactId?: string | null;
  safetyArtifactId?: string | null;
  result?: Record<string, unknown> | null;
}

export interface BackupOperationRecord {
  id: string;
  idempotencyKey: string;
  requestFingerprint: string;
  kind: BackupOperationKind;
  mode: BackupOperationMode;
  state: BackupOperationState;
  stage: string;
  cancellable: boolean;
  cancelRequestedAt: string | null;
  progressCurrent: number;
  progressTotal: number;
  errorCode: string | null;
  errorDetails: Record<string, unknown> | null;
  resultArtifactId: string | null;
  safetyArtifactId: string | null;
  result: Record<string, unknown> | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  metadataExpiresAt: string;
}

export type CreateBackupOperationRecord = BackupOperationRecord;

export interface BackupOperationPatch {
  mode?: BackupOperationMode;
  state?: BackupOperationState;
  stage?: string;
  cancellable?: boolean;
  cancelRequestedAt?: string | null;
  progressCurrent?: number;
  progressTotal?: number;
  errorCode?: string | null;
  errorDetails?: Record<string, unknown> | null;
  resultArtifactId?: string | null;
  safetyArtifactId?: string | null;
  result?: Record<string, unknown> | null;
  updatedAt?: string;
  finishedAt?: string | null;
  metadataExpiresAt?: string;
}

export interface BackupArtifactRecord {
  id: string;
  operationId: string;
  kind: BackupArtifactKind;
  path: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  encrypted: boolean;
  createdAt: string;
  expiresAt: string;
  downloadTokenHash: string | null;
  downloadTokenExpiresAt: string | null;
  downloadTokenConsumedAt: string | null;
}

export type CreateBackupArtifactRecord = BackupArtifactRecord;

export interface BackupArtifactTokenPatch {
  downloadTokenHash: string | null;
  downloadTokenExpiresAt: string | null;
  downloadTokenConsumedAt: string | null;
}

export function isActiveBackupOperation(state: BackupOperationState): boolean {
  return state === 'queued' || state === 'running';
}

export function isTerminalBackupOperation(state: BackupOperationState): boolean {
  return !isActiveBackupOperation(state);
}
