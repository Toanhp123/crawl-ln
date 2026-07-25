import { z } from 'zod';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import { BackupOperationError } from '../../application/errors/backup.error.js';
import type { BackupControlRepository } from '../../application/ports/backup-control.repository.js';
import type {
  BackupArtifactRecord,
  BackupArtifactTokenPatch,
  BackupOperationPatch,
  BackupOperationRecord,
  CreateBackupArtifactRecord,
  CreateBackupOperationRecord
} from '../../domain/backup-operation.models.js';
import type {
  BackupCompatibility,
  BackupInventory,
  BackupMergePlan,
  CreateRestoreSessionRecord,
  RestoreSessionPatch,
  RestoreSessionRecord
} from '../../domain/restore-session.models.js';

const operationRowSchema = z.object({
  id: z.string().min(1),
  idempotency_key: z.string().min(1),
  request_fingerprint: z.string().min(1),
  kind: z.enum(['backup', 'restore']),
  mode: z.enum(['merge', 'replace']).nullable(),
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'interrupted', 'cancelled']),
  stage: z.string().min(1),
  cancellable: z.coerce.number().int().min(0).max(1),
  cancel_requested_at: z.string().nullable(),
  progress_current: z.coerce.number().int().nonnegative(),
  progress_total: z.coerce.number().int().nonnegative(),
  error_code: z.string().nullable(),
  error_details_json: z.string().nullable(),
  result_artifact_id: z.string().nullable(),
  safety_artifact_id: z.string().nullable(),
  result_json: z.string().nullable(),
  started_at: z.string().min(1),
  updated_at: z.string().min(1),
  finished_at: z.string().nullable(),
  metadata_expires_at: z.string().min(1)
});

const artifactRowSchema = z.object({
  id: z.string().min(1),
  operation_id: z.string().min(1),
  kind: z.enum(['user-backup', 'safety-backup']),
  path: z.string().min(1),
  filename: z.string().min(1),
  size_bytes: z.coerce.number().int().nonnegative(),
  sha256: z.string().length(64),
  encrypted: z.coerce.number().int().min(0).max(1),
  created_at: z.string().min(1),
  expires_at: z.string().min(1),
  download_token_hash: z.string().nullable(),
  download_token_expires_at: z.string().nullable(),
  download_token_consumed_at: z.string().nullable()
});

const restoreSessionRowSchema = z.object({
  id: z.string().min(1),
  session_token_hash: z.string().length(64),
  inspection_token_hash: z.string().length(64).nullable(),
  state: z.enum([
    'uploading',
    'uploaded',
    'hashing',
    'awaiting-password',
    'inspecting',
    'ready',
    'locked',
    'consumed',
    'cancelled',
    'expired',
    'invalid'
  ]),
  stage: z.string().min(1),
  original_filename: z.string().min(1),
  expected_bytes: z.coerce.number().int().positive(),
  received_bytes: z.coerce.number().int().nonnegative(),
  file_fingerprint: z.string().min(1),
  archive_checksum: z.string().length(64).nullable(),
  encrypted: z.coerce.number().int().min(0).max(1).nullable(),
  password_failures: z.coerce.number().int().min(0).max(5),
  inventory_json: z.string().nullable(),
  compatibility_json: z.string().nullable(),
  merge_plan_json: z.string().nullable(),
  merge_plan_fingerprint: z.string().nullable(),
  selected_mode: z.enum(['merge', 'replace']).nullable(),
  settings_policy: z.enum(['keep-current', 'use-backup']).nullable(),
  temporary_root: z.string().min(1),
  created_at: z.string().min(1),
  last_activity_at: z.string().min(1),
  expires_at: z.string().min(1),
  absolute_expires_at: z.string().min(1),
  locked_operation_id: z.string().nullable()
});

function parseRecordJson(value: string | null, field: string): Record<string, unknown> | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field} must contain a JSON object or null`);
  }
  return parsed as Record<string, unknown>;
}

function serializeRecordJson(value: Record<string, unknown> | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function mapOperation(input: unknown): BackupOperationRecord {
  const row = operationRowSchema.parse(input);
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    kind: row.kind,
    mode: row.mode,
    state: row.state,
    stage: row.stage,
    cancellable: Boolean(Number(row.cancellable)),
    cancelRequestedAt: row.cancel_requested_at,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    errorCode: row.error_code,
    errorDetails: parseRecordJson(row.error_details_json, 'error_details_json'),
    resultArtifactId: row.result_artifact_id,
    safetyArtifactId: row.safety_artifact_id,
    result: parseRecordJson(row.result_json, 'result_json'),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
    metadataExpiresAt: row.metadata_expires_at
  };
}

function mapArtifact(input: unknown): BackupArtifactRecord {
  const row = artifactRowSchema.parse(input);
  return {
    id: row.id,
    operationId: row.operation_id,
    kind: row.kind,
    path: row.path,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    encrypted: Boolean(Number(row.encrypted)),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    downloadTokenHash: row.download_token_hash,
    downloadTokenExpiresAt: row.download_token_expires_at,
    downloadTokenConsumedAt: row.download_token_consumed_at
  };
}

function mapRestoreSession(input: unknown): RestoreSessionRecord {
  const row = restoreSessionRowSchema.parse(input);
  return {
    id: row.id,
    sessionTokenHash: row.session_token_hash,
    inspectionTokenHash: row.inspection_token_hash,
    state: row.state,
    stage: row.stage,
    originalFilename: row.original_filename,
    expectedBytes: row.expected_bytes,
    receivedBytes: row.received_bytes,
    fileFingerprint: row.file_fingerprint,
    archiveChecksum: row.archive_checksum,
    encrypted: row.encrypted === null ? null : Boolean(Number(row.encrypted)),
    passwordFailures: row.password_failures,
    inventory: parseRecordJson(row.inventory_json, 'inventory_json') as BackupInventory | null,
    compatibility: parseRecordJson(
      row.compatibility_json,
      'compatibility_json'
    ) as BackupCompatibility | null,
    mergePlan: parseRecordJson(row.merge_plan_json, 'merge_plan_json') as BackupMergePlan | null,
    mergePlanFingerprint: row.merge_plan_fingerprint,
    selectedMode: row.selected_mode,
    settingsPolicy: row.settings_policy,
    temporaryRoot: row.temporary_root,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    lockedOperationId: row.locked_operation_id
  };
}

const operationPatchColumns: Record<keyof BackupOperationPatch, string> = {
  mode: 'mode',
  state: 'state',
  stage: 'stage',
  cancellable: 'cancellable',
  cancelRequestedAt: 'cancel_requested_at',
  progressCurrent: 'progress_current',
  progressTotal: 'progress_total',
  errorCode: 'error_code',
  errorDetails: 'error_details_json',
  resultArtifactId: 'result_artifact_id',
  safetyArtifactId: 'safety_artifact_id',
  result: 'result_json',
  updatedAt: 'updated_at',
  finishedAt: 'finished_at',
  metadataExpiresAt: 'metadata_expires_at'
};

function operationPatchValue(
  key: keyof BackupOperationPatch,
  value: BackupOperationPatch[keyof BackupOperationPatch]
): string | number | null {
  if (key === 'cancellable') return value ? 1 : 0;
  if (key === 'errorDetails' || key === 'result') {
    return serializeRecordJson(value as Record<string, unknown> | null);
  }
  return value as string | number | null;
}

const restoreSessionPatchColumns: Record<keyof RestoreSessionPatch, string> = {
  sessionTokenHash: 'session_token_hash',
  inspectionTokenHash: 'inspection_token_hash',
  state: 'state',
  stage: 'stage',
  originalFilename: 'original_filename',
  expectedBytes: 'expected_bytes',
  receivedBytes: 'received_bytes',
  fileFingerprint: 'file_fingerprint',
  archiveChecksum: 'archive_checksum',
  encrypted: 'encrypted',
  passwordFailures: 'password_failures',
  inventory: 'inventory_json',
  compatibility: 'compatibility_json',
  mergePlan: 'merge_plan_json',
  mergePlanFingerprint: 'merge_plan_fingerprint',
  selectedMode: 'selected_mode',
  settingsPolicy: 'settings_policy',
  temporaryRoot: 'temporary_root',
  lastActivityAt: 'last_activity_at',
  expiresAt: 'expires_at',
  absoluteExpiresAt: 'absolute_expires_at',
  lockedOperationId: 'locked_operation_id'
};

function restoreSessionPatchValue(
  key: keyof RestoreSessionPatch,
  value: RestoreSessionPatch[keyof RestoreSessionPatch]
): string | number | null {
  if (key === 'encrypted') return value === null ? null : value ? 1 : 0;
  if (key === 'inventory' || key === 'compatibility' || key === 'mergePlan') {
    return serializeRecordJson(value as Record<string, unknown> | null);
  }
  return value as string | number | null;
}

export class SqliteBackupControlRepository implements BackupControlRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createOperation(input: CreateBackupOperationRecord): BackupOperationRecord {
    this.database.connection
      .prepare(
        `INSERT INTO backup_operations(
           id, idempotency_key, request_fingerprint, kind, mode, state, stage, cancellable,
           cancel_requested_at, progress_current, progress_total, error_code, error_details_json,
           result_artifact_id, safety_artifact_id, result_json, started_at, updated_at,
           finished_at, metadata_expires_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.idempotencyKey,
        input.requestFingerprint,
        input.kind,
        input.mode,
        input.state,
        input.stage,
        input.cancellable ? 1 : 0,
        input.cancelRequestedAt,
        input.progressCurrent,
        input.progressTotal,
        input.errorCode,
        serializeRecordJson(input.errorDetails),
        input.resultArtifactId,
        input.safetyArtifactId,
        serializeRecordJson(input.result),
        input.startedAt,
        input.updatedAt,
        input.finishedAt,
        input.metadataExpiresAt
      );
    return this.requireOperation(input.id);
  }

  createRestoreOperationAndLockSession(input: {
    operation: CreateBackupOperationRecord;
    sessionId: string;
    expectedPlanFingerprint: string;
    now: string;
  }): { operation: BackupOperationRecord; session: RestoreSessionRecord } {
    return this.database.transactionSync(() => {
      const session = this.findRestoreSession(input.sessionId);
      if (!session) {
        throw new BackupOperationError(
          'RESTORE_SESSION_NOT_FOUND',
          404,
          'Restore session was not found',
          false,
          { sessionId: input.sessionId }
        );
      }
      if (session.state !== 'ready') {
        throw new BackupOperationError(
          'RESTORE_SESSION_STATE_INVALID',
          409,
          'Restore session is not ready to start execution',
          false,
          { sessionId: session.id, state: session.state }
        );
      }
      if (session.expiresAt <= input.now || session.absoluteExpiresAt <= input.now) {
        throw new BackupOperationError(
          'RESTORE_SESSION_EXPIRED',
          410,
          'Restore session has expired',
          false,
          { sessionId: session.id }
        );
      }
      if (
        !session.mergePlanFingerprint ||
        session.mergePlanFingerprint !== input.expectedPlanFingerprint
      ) {
        throw new BackupOperationError(
          'RESTORE_PLAN_STALE',
          409,
          'Restore plan is stale and must be recreated',
          true,
          { sessionId: session.id }
        );
      }
      const operation = this.createOperation(input.operation);
      const locked = this.updateRestoreSession(session.id, {
        state: 'locked',
        stage: 'locked',
        lockedOperationId: operation.id,
        lastActivityAt: input.now
      });
      return { operation, session: locked };
    });
  }

  findOperation(id: string): BackupOperationRecord | null {
    const row = this.database.connection
      .prepare('SELECT * FROM backup_operations WHERE id = ?')
      .get(id);
    return row ? mapOperation(row) : null;
  }

  findByIdempotencyKey(key: string): BackupOperationRecord | null {
    const row = this.database.connection
      .prepare('SELECT * FROM backup_operations WHERE idempotency_key = ?')
      .get(key);
    return row ? mapOperation(row) : null;
  }

  findActiveOperation(): BackupOperationRecord | null {
    const row = this.database.connection
      .prepare(
        `SELECT * FROM backup_operations
         WHERE state IN ('queued','running')
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`
      )
      .get();
    return row ? mapOperation(row) : null;
  }

  findActiveOrLatestOperation(): BackupOperationRecord | null {
    const row = this.database.connection
      .prepare(
        `SELECT *
         FROM backup_operations
         ORDER BY
           CASE WHEN state IN ('queued','running') THEN 0 ELSE 1 END,
           updated_at DESC,
           id DESC
         LIMIT 1`
      )
      .get();
    return row ? mapOperation(row) : null;
  }

  updateOperation(id: string, patch: BackupOperationPatch): BackupOperationRecord {
    const entries = Object.entries(patch).filter((entry) => entry[1] !== undefined) as Array<
      [keyof BackupOperationPatch, BackupOperationPatch[keyof BackupOperationPatch]]
    >;
    if (entries.length === 0) return this.requireOperation(id);
    const assignments = entries.map(([key]) => `${operationPatchColumns[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) => operationPatchValue(key, value));
    const row = this.database.connection
      .prepare(`UPDATE backup_operations SET ${assignments} WHERE id = ? RETURNING *`)
      .get(...values, id);
    if (!row) throw new Error(`Backup operation not found: ${id}`);
    return mapOperation(row);
  }

  markActiveOperationsInterrupted(now: string, expiresAt: string): number {
    const result = this.database.connection
      .prepare(
        `UPDATE backup_operations
         SET state = 'interrupted',
             stage = 'interrupted',
             cancellable = 0,
             error_code = 'BACKUP_OPERATION_INTERRUPTED',
             error_details_json = NULL,
             updated_at = ?,
             finished_at = ?,
             metadata_expires_at = ?
         WHERE state IN ('queued','running')`
      )
      .run(now, now, expiresAt);
    return Number(result.changes);
  }

  deleteOperationsExpiredBefore(now: string): number {
    const result = this.database.connection
      .prepare(
        `DELETE FROM backup_operations
         WHERE metadata_expires_at <= ?
           AND state NOT IN ('queued','running')
           AND NOT EXISTS (
             SELECT 1 FROM backup_artifacts
             WHERE backup_artifacts.operation_id = backup_operations.id
           )`
      )
      .run(now);
    return Number(result.changes);
  }

  createArtifact(input: CreateBackupArtifactRecord): BackupArtifactRecord {
    this.database.connection
      .prepare(
        `INSERT INTO backup_artifacts(
           id, operation_id, kind, path, filename, size_bytes, sha256, encrypted,
           created_at, expires_at, download_token_hash, download_token_expires_at,
           download_token_consumed_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.operationId,
        input.kind,
        input.path,
        input.filename,
        input.sizeBytes,
        input.sha256,
        input.encrypted ? 1 : 0,
        input.createdAt,
        input.expiresAt,
        input.downloadTokenHash,
        input.downloadTokenExpiresAt,
        input.downloadTokenConsumedAt
      );
    return this.requireArtifact(input.id);
  }

  findArtifact(id: string): BackupArtifactRecord | null {
    const row = this.database.connection
      .prepare('SELECT * FROM backup_artifacts WHERE id = ?')
      .get(id);
    return row ? mapArtifact(row) : null;
  }

  updateArtifactToken(id: string, patch: BackupArtifactTokenPatch): BackupArtifactRecord {
    const row = this.database.connection
      .prepare(
        `UPDATE backup_artifacts
         SET download_token_hash = ?,
             download_token_expires_at = ?,
             download_token_consumed_at = ?
         WHERE id = ?
         RETURNING *`
      )
      .get(
        patch.downloadTokenHash,
        patch.downloadTokenExpiresAt,
        patch.downloadTokenConsumedAt,
        id
      );
    if (!row) throw new Error(`Backup artifact not found: ${id}`);
    return mapArtifact(row);
  }

  consumeArtifactToken(tokenHash: string, now: string): BackupArtifactRecord | null {
    const row = this.database.connection
      .prepare(
        `UPDATE backup_artifacts
         SET download_token_consumed_at = ?
         WHERE download_token_hash = ?
           AND download_token_consumed_at IS NULL
           AND download_token_expires_at > ?
           AND expires_at > ?
         RETURNING *`
      )
      .get(now, tokenHash, now, now);
    return row ? mapArtifact(row) : null;
  }

  listArtifactsExpiredBefore(now: string): BackupArtifactRecord[] {
    return this.database.connection
      .prepare(
        `SELECT * FROM backup_artifacts
         WHERE expires_at <= ?
         ORDER BY expires_at, id`
      )
      .all(now)
      .map(mapArtifact);
  }

  deleteArtifact(id: string): void {
    this.database.connection.prepare('DELETE FROM backup_artifacts WHERE id = ?').run(id);
  }

  createRestoreSession(input: CreateRestoreSessionRecord): RestoreSessionRecord {
    this.database.connection
      .prepare(
        `INSERT INTO backup_restore_sessions(
           id, session_token_hash, inspection_token_hash, state, stage, original_filename,
           expected_bytes, received_bytes, file_fingerprint, archive_checksum, encrypted,
           password_failures, inventory_json, compatibility_json, merge_plan_json,
           merge_plan_fingerprint, selected_mode, settings_policy, temporary_root, created_at,
           last_activity_at, expires_at, absolute_expires_at, locked_operation_id
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.sessionTokenHash,
        input.inspectionTokenHash,
        input.state,
        input.stage,
        input.originalFilename,
        input.expectedBytes,
        input.receivedBytes,
        input.fileFingerprint,
        input.archiveChecksum,
        input.encrypted === null ? null : input.encrypted ? 1 : 0,
        input.passwordFailures,
        serializeRecordJson(input.inventory as Record<string, unknown> | null),
        serializeRecordJson(input.compatibility as Record<string, unknown> | null),
        serializeRecordJson(input.mergePlan as Record<string, unknown> | null),
        input.mergePlanFingerprint,
        input.selectedMode,
        input.settingsPolicy,
        input.temporaryRoot,
        input.createdAt,
        input.lastActivityAt,
        input.expiresAt,
        input.absoluteExpiresAt,
        input.lockedOperationId
      );
    return this.requireRestoreSession(input.id);
  }

  findRestoreSession(id: string): RestoreSessionRecord | null {
    const row = this.database.connection
      .prepare('SELECT * FROM backup_restore_sessions WHERE id = ?')
      .get(id);
    return row ? mapRestoreSession(row) : null;
  }

  findCurrentRestoreSession(): RestoreSessionRecord | null {
    const row = this.database.connection
      .prepare(
        `SELECT * FROM backup_restore_sessions
         WHERE state NOT IN ('consumed','cancelled','expired','invalid')
         ORDER BY last_activity_at DESC, id DESC
         LIMIT 1`
      )
      .get();
    return row ? mapRestoreSession(row) : null;
  }

  findRestoreSessionByTokenHash(tokenHash: string): RestoreSessionRecord | null {
    const row = this.database.connection
      .prepare(
        `SELECT * FROM backup_restore_sessions
         WHERE session_token_hash = ? OR inspection_token_hash = ?
         LIMIT 1`
      )
      .get(tokenHash, tokenHash);
    return row ? mapRestoreSession(row) : null;
  }

  updateRestoreSession(id: string, patch: RestoreSessionPatch): RestoreSessionRecord {
    const entries = Object.entries(patch).filter((entry) => entry[1] !== undefined) as Array<
      [keyof RestoreSessionPatch, RestoreSessionPatch[keyof RestoreSessionPatch]]
    >;
    if (entries.length === 0) return this.requireRestoreSession(id);
    const assignments = entries.map(([key]) => `${restoreSessionPatchColumns[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) => restoreSessionPatchValue(key, value));
    const row = this.database.connection
      .prepare(`UPDATE backup_restore_sessions SET ${assignments} WHERE id = ? RETURNING *`)
      .get(...values, id);
    if (!row) throw new Error(`Restore session not found: ${id}`);
    return mapRestoreSession(row);
  }

  expireRestoreSessions(now: string): RestoreSessionRecord[] {
    return this.database.transactionSync(() => {
      const rows = this.database.connection
        .prepare(
          `SELECT * FROM backup_restore_sessions
           WHERE state NOT IN ('consumed','cancelled','expired','invalid')
             AND state != 'locked'
             AND (expires_at <= ? OR absolute_expires_at <= ?)
           ORDER BY expires_at, id`
        )
        .all(now, now)
        .map(mapRestoreSession);
      const update = this.database.connection.prepare(
        `UPDATE backup_restore_sessions
         SET state = 'expired',
             stage = 'expired',
             session_token_hash = lower(hex(randomblob(32))),
             inspection_token_hash = NULL,
             last_activity_at = ?,
             expires_at = ?
         WHERE id = ?`
      );
      for (const row of rows) update.run(now, now, row.id);
      return rows;
    });
  }

  deleteTerminalRestoreSessionsBefore(now: string): number {
    const result = this.database.connection
      .prepare(
        `DELETE FROM backup_restore_sessions
         WHERE state IN ('consumed','cancelled','expired','invalid')
           AND absolute_expires_at <= ?`
      )
      .run(now);
    return Number(result.changes);
  }

  transaction<T>(work: () => T): T {
    return this.database.transactionSync(work);
  }

  close(): void {
    this.database.close();
  }

  private requireOperation(id: string): BackupOperationRecord {
    const operation = this.findOperation(id);
    if (!operation) throw new Error(`Backup operation not found: ${id}`);
    return operation;
  }

  private requireArtifact(id: string): BackupArtifactRecord {
    const artifact = this.findArtifact(id);
    if (!artifact) throw new Error(`Backup artifact not found: ${id}`);
    return artifact;
  }

  private requireRestoreSession(id: string): RestoreSessionRecord {
    const session = this.findRestoreSession(id);
    if (!session) throw new Error(`Restore session not found: ${id}`);
    return session;
  }
}
