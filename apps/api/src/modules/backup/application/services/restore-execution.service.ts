import { createHash } from 'node:crypto';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type {
  BackupOperationRecord,
  CreateBackupOperationRecord
} from '../../domain/backup-operation.models.js';
import type { RestoreMode, RestoreSessionRecord } from '../../domain/restore-session.models.js';
import { BackupOperationError } from '../errors/backup.error.js';
import { canonicalJson } from './backup-merge-planner.js';
import type {
  BackupOperationCoordinator,
  BackupOperationExecutor
} from './backup-operation-coordinator.js';
import type { BackupOperationService } from './backup-operation.service.js';
import type { RestorePreparationService } from './restore-preparation.service.js';
import { MergeRestoreExecutor, type RestoreExecutionSecret } from './merge-restore.executor.js';
import { ReplaceRestoreExecutor } from './replace-restore.executor.js';

const operationRetentionMs = 7 * 24 * 60 * 60 * 1_000;
export const REPLACE_CONFIRMATION_PHRASE = 'THAY THẾ DỮ LIỆU';

export interface StartRestoreInput {
  sessionId: string;
  sessionToken: string;
  inspectionToken: string;
  planFingerprint: string;
  idempotencyKey: string;
  confirmation: { accepted: boolean; typedPhrase?: string };
  currentSettings: Record<string, unknown>;
}

type RestoreExecutor = BackupOperationExecutor<RestoreExecutionSecret>;

export class RestoreExecutionService {
  constructor(
    private readonly repository: BackupControlRepository,
    private readonly operations: BackupOperationService,
    private readonly coordinator: BackupOperationCoordinator,
    private readonly preparation: RestorePreparationService,
    private readonly mergeExecutor: RestoreExecutor,
    private readonly replaceExecutor: RestoreExecutor,
    private readonly options: { clock: { now(): Date }; ids: { randomId(): string } }
  ) {}

  start(input: StartRestoreInput): BackupOperationRecord {
    const session = this.requireSession(input.sessionId);
    this.validateConfirmation(session, input.confirmation);
    const requestFingerprint = this.requestFingerprint(session, input);
    const existing = this.repository.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return this.resolveIdempotent(existing, requestFingerprint);

    const authenticated = this.preparation.requireAuthenticated(
      input.sessionId,
      input.sessionToken
    );
    this.preparation.requireInspectionToken(authenticated, input.inspectionToken);
    this.validateReadyPlan(authenticated, input.planFingerprint);

    const now = this.options.clock.now();
    const operation: CreateBackupOperationRecord = {
      id: this.options.ids.randomId(),
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      kind: 'restore',
      mode: authenticated.selectedMode,
      state: 'queued',
      stage: 'queued',
      cancellable: true,
      cancelRequestedAt: null,
      progressCurrent: 0,
      progressTotal:
        authenticated.selectedMode === 'merge'
          ? MergeRestoreExecutor.progressTotal()
          : ReplaceRestoreExecutor.progressTotal(),
      errorCode: null,
      errorDetails: null,
      resultArtifactId: null,
      safetyArtifactId: null,
      result: null,
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      finishedAt: null,
      metadataExpiresAt: new Date(now.getTime() + operationRetentionMs).toISOString()
    };

    try {
      const created = this.repository.createRestoreOperationAndLockSession({
        operation,
        sessionId: authenticated.id,
        expectedPlanFingerprint: input.planFingerprint,
        now: now.toISOString()
      });
      this.operations.announceCreated();
      this.coordinator.schedule(
        created.operation,
        authenticated.selectedMode === 'merge' ? this.mergeExecutor : this.replaceExecutor,
        {
          sessionId: authenticated.id,
          inspectionToken: input.inspectionToken,
          planFingerprint: input.planFingerprint,
          currentSettings: input.currentSettings
        }
      );
      return created.operation;
    } catch (error) {
      const racedExisting = this.repository.findByIdempotencyKey(input.idempotencyKey);
      if (racedExisting) return this.resolveIdempotent(racedExisting, requestFingerprint);
      const active = this.repository.findActiveOperation();
      if (active) throw this.activeError(active);
      throw error;
    }
  }

  private requireSession(sessionId: string): RestoreSessionRecord {
    const session = this.repository.findRestoreSession(sessionId);
    if (!session) {
      throw new BackupOperationError(
        'RESTORE_SESSION_NOT_FOUND',
        404,
        'Restore session was not found',
        false,
        { sessionId }
      );
    }
    return session;
  }

  private validateReadyPlan(session: RestoreSessionRecord, planFingerprint: string): void {
    if (session.state !== 'ready') {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not ready to start execution',
        false,
        { sessionId: session.id, state: session.state }
      );
    }
    if (
      !session.selectedMode ||
      !session.settingsPolicy ||
      !session.mergePlan ||
      session.mergePlanFingerprint !== planFingerprint
    ) {
      throw new BackupOperationError(
        'RESTORE_PLAN_STALE',
        409,
        'Restore plan is stale and must be recreated',
        true,
        { sessionId: session.id }
      );
    }
  }

  private validateConfirmation(
    session: RestoreSessionRecord,
    confirmation: StartRestoreInput['confirmation']
  ): void {
    const mode = session.selectedMode;
    const typed = confirmation.typedPhrase ?? '';
    const valid =
      confirmation.accepted === true &&
      (mode === 'replace' ? typed === REPLACE_CONFIRMATION_PHRASE : typed.length === 0);
    if (!valid) {
      throw new BackupOperationError(
        'RESTORE_CONFIRMATION_INVALID',
        422,
        'Restore confirmation is invalid',
        false,
        { sessionId: session.id, mode }
      );
    }
  }

  private requestFingerprint(session: RestoreSessionRecord, input: StartRestoreInput): string {
    const currentSettingsSha256 = createHash('sha256')
      .update(canonicalJson(input.currentSettings), 'utf8')
      .digest('hex');
    return createHash('sha256')
      .update(
        canonicalJson({
          version: 1,
          sessionId: session.id,
          planFingerprint: input.planFingerprint,
          mode: session.selectedMode,
          settingsPolicy: session.settingsPolicy,
          confirmationAccepted: input.confirmation.accepted,
          typedPhraseValid:
            session.selectedMode === 'replace'
              ? input.confirmation.typedPhrase === REPLACE_CONFIRMATION_PHRASE
              : (input.confirmation.typedPhrase ?? '').length === 0,
          currentSettingsSha256
        }),
        'utf8'
      )
      .digest('hex');
  }

  private resolveIdempotent(
    existing: BackupOperationRecord,
    requestFingerprint: string
  ): BackupOperationRecord {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new BackupOperationError(
        'IDEMPOTENCY_KEY_REUSED',
        409,
        'Idempotency key was already used for a different request',
        false,
        { operationId: existing.id }
      );
    }
    return existing;
  }

  private activeError(active: BackupOperationRecord): BackupOperationError {
    return new BackupOperationError(
      'BACKUP_OPERATION_ACTIVE',
      409,
      'Another backup or restore operation is already running',
      true,
      {
        operation: {
          id: active.id,
          kind: active.kind,
          mode: active.mode,
          state: active.state,
          stage: active.stage
        }
      }
    );
  }
}
