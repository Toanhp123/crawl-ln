export type BackupErrorCode =
  | 'BACKUP_OPERATION_ACTIVE'
  | 'BACKUP_OPERATION_NOT_FOUND'
  | 'BACKUP_OPERATION_NOT_CANCELLABLE'
  | 'BACKUP_OPERATION_CANCELLED'
  | 'BACKUP_OPERATION_INTERRUPTED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'BACKUP_ARTIFACT_EXPIRED'
  | 'BACKUP_DOWNLOAD_TOKEN_INVALID'
  | 'BACKUP_PASSWORD_TOO_SHORT'
  | 'BACKUP_UNENCRYPTED_CONFIRMATION_REQUIRED'
  | 'RESTORE_SESSION_EXISTS'
  | 'RESTORE_SESSION_NOT_FOUND'
  | 'RESTORE_SESSION_TOKEN_INVALID'
  | 'RESTORE_SESSION_LOCKED'
  | 'RESTORE_SESSION_EXPIRED'
  | 'RESTORE_SESSION_STATE_INVALID'
  | 'RESTORE_PLAN_UNAVAILABLE'
  | 'RESTORE_PLAN_STALE'
  | 'RESTORE_INSPECTION_TOKEN_INVALID'
  | 'RESTORE_CONFIRMATION_INVALID'
  | 'RESTORE_REPLACE_RECOVERY_FAILED'
  | 'RESTORE_UPLOAD_INVALID'
  | 'RESTORE_UPLOAD_INCOMPLETE'
  | 'RESTORE_UPLOAD_TRUNCATED'
  | 'RESTORE_FINGERPRINT_INVALID'
  | 'RESTORE_FILE_FINGERPRINT_MISMATCH'
  | 'OFFSET_MISMATCH'
  | 'BACKUP_PASSWORD_INVALID'
  | 'BACKUP_ARCHIVE_UNSAFE'
  | 'BACKUP_SCHEMA_UNSUPPORTED'
  | 'BACKUP_SCHEMA_NEWER_THAN_APP'
  | 'BACKUP_STAGING_INVALID';

export class BackupOperationError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    readonly status: 400 | 401 | 404 | 409 | 410 | 413 | 422,
    message: string,
    readonly retryable: boolean,
    readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = 'BackupOperationError';
  }
}

export class BackupBadRequestError extends Error {
  readonly kind = 'bad_request' as const;

  constructor(
    message = 'Bad request',
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'BackupBadRequestError';
  }
}

export class BackupPasswordInvalidError extends BackupBadRequestError {
  readonly code = 'BACKUP_PASSWORD_INVALID' as const;

  constructor(message = 'Backup password is invalid') {
    super(message);
    this.name = 'BackupPasswordInvalidError';
  }
}
