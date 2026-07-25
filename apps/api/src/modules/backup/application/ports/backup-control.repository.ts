import type {
  BackupArtifactRecord,
  BackupArtifactTokenPatch,
  BackupOperationPatch,
  BackupOperationRecord,
  CreateBackupArtifactRecord,
  CreateBackupOperationRecord
} from '../../domain/backup-operation.models.js';
import type {
  CreateRestoreSessionRecord,
  RestoreSessionPatch,
  RestoreSessionRecord
} from '../../domain/restore-session.models.js';

export interface BackupControlRepository {
  createOperation(input: CreateBackupOperationRecord): BackupOperationRecord;
  createRestoreOperationAndLockSession(input: {
    operation: CreateBackupOperationRecord;
    sessionId: string;
    expectedPlanFingerprint: string;
    now: string;
  }): { operation: BackupOperationRecord; session: RestoreSessionRecord };
  findOperation(id: string): BackupOperationRecord | null;
  findByIdempotencyKey(key: string): BackupOperationRecord | null;
  findActiveOperation(): BackupOperationRecord | null;
  findActiveOrLatestOperation(): BackupOperationRecord | null;
  updateOperation(id: string, patch: BackupOperationPatch): BackupOperationRecord;
  markActiveOperationsInterrupted(now: string, expiresAt: string): number;
  deleteOperationsExpiredBefore(now: string): number;

  createArtifact(input: CreateBackupArtifactRecord): BackupArtifactRecord;
  findArtifact(id: string): BackupArtifactRecord | null;
  updateArtifactToken(id: string, patch: BackupArtifactTokenPatch): BackupArtifactRecord;
  consumeArtifactToken(tokenHash: string, now: string): BackupArtifactRecord | null;
  listArtifactsExpiredBefore(now: string): BackupArtifactRecord[];
  deleteArtifact(id: string): void;

  createRestoreSession(input: CreateRestoreSessionRecord): RestoreSessionRecord;
  findRestoreSession(id: string): RestoreSessionRecord | null;
  findCurrentRestoreSession(): RestoreSessionRecord | null;
  findRestoreSessionByTokenHash(tokenHash: string): RestoreSessionRecord | null;
  updateRestoreSession(id: string, patch: RestoreSessionPatch): RestoreSessionRecord;
  expireRestoreSessions(now: string): RestoreSessionRecord[];
  deleteTerminalRestoreSessionsBefore(now: string): number;

  transaction<T>(work: () => T): T;
  close(): void;
}
