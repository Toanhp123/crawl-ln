import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import { BackupOperationError } from '../errors/backup.error.js';
import type {
  BackupOperationRecord,
  BackupOperationState,
  BackupOperationTransitionInput,
  StartOperationInput
} from '../../domain/backup-operation.models.js';

const metadataRetentionMs = 7 * 24 * 60 * 60 * 1_000;

const transitions: Record<BackupOperationState, readonly BackupOperationState[]> = {
  queued: ['running', 'cancelled', 'failed', 'interrupted'],
  running: ['succeeded', 'failed', 'cancelled', 'interrupted'],
  succeeded: [],
  failed: [],
  interrupted: [],
  cancelled: []
};

export interface BackupOperationServiceOptions {
  clock: { now(): Date };
  ids: { randomId(): string };
  onChanged?(reason: string): void;
}

export interface StartOperationResult {
  operation: BackupOperationRecord;
  created: boolean;
}

export class BackupOperationService {
  constructor(
    private readonly repository: BackupControlRepository,
    private readonly options: BackupOperationServiceOptions
  ) {}

  start(input: StartOperationInput): StartOperationResult {
    this.assertStartInput(input);
    try {
      const result = this.repository.transaction(() => this.startInTransaction(input));
      if (result.created) this.notify('backup.operation.stage-changed');
      return result;
    } catch (error) {
      const existing = this.repository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return this.resolveIdempotent(existing, input.requestFingerprint);
      const active = this.repository.findActiveOperation();
      if (active && this.isConstraintError(error)) throw this.activeError(active);
      throw error;
    }
  }

  announceCreated(): void {
    this.notify('backup.operation.stage-changed');
  }

  current(): BackupOperationRecord | null {
    return this.repository.findActiveOrLatestOperation();
  }

  read(id: string): BackupOperationRecord {
    const operation = this.repository.findOperation(id);
    if (!operation) {
      throw new BackupOperationError(
        'BACKUP_OPERATION_NOT_FOUND',
        404,
        'Backup operation was not found',
        false,
        { operationId: id }
      );
    }
    return operation;
  }

  transition(id: string, input: BackupOperationTransitionInput): BackupOperationRecord {
    const operation = this.repository.transaction(() => {
      const current = this.read(id);
      const nextState = input.state ?? current.state;
      this.assertTransition(current.state, nextState);
      const now = this.now();
      return this.repository.updateOperation(id, {
        state: nextState,
        stage: input.stage,
        cancellable: input.cancellable,
        progressCurrent: input.progressCurrent ?? current.progressCurrent,
        progressTotal: input.progressTotal ?? current.progressTotal,
        errorCode: Object.hasOwn(input, 'errorCode')
          ? (input.errorCode ?? null)
          : current.errorCode,
        errorDetails: Object.hasOwn(input, 'errorDetails')
          ? (input.errorDetails ?? null)
          : current.errorDetails,
        resultArtifactId: Object.hasOwn(input, 'resultArtifactId')
          ? (input.resultArtifactId ?? null)
          : current.resultArtifactId,
        safetyArtifactId: Object.hasOwn(input, 'safetyArtifactId')
          ? (input.safetyArtifactId ?? null)
          : current.safetyArtifactId,
        result: Object.hasOwn(input, 'result') ? (input.result ?? null) : current.result,
        updatedAt: now
      });
    });
    this.notify('backup.operation.stage-changed');
    return operation;
  }

  markRunning(id: string): BackupOperationRecord {
    const current = this.read(id);
    return this.transition(id, {
      state: 'running',
      stage: current.stage,
      progressCurrent: current.progressCurrent,
      progressTotal: current.progressTotal,
      cancellable: current.cancellable
    });
  }

  requestCancel(id: string): BackupOperationRecord {
    const operation = this.repository.transaction(() => {
      const current = this.read(id);
      if ((current.state !== 'queued' && current.state !== 'running') || !current.cancellable) {
        throw new BackupOperationError(
          'BACKUP_OPERATION_NOT_CANCELLABLE',
          409,
          'Backup operation is no longer cancellable',
          false,
          { operationId: id, state: current.state, stage: current.stage }
        );
      }
      if (current.cancelRequestedAt) return current;
      const now = this.now();
      return this.repository.updateOperation(id, {
        cancelRequestedAt: now,
        updatedAt: now
      });
    });
    this.notify('backup.operation.stage-changed');
    return operation;
  }

  cancellationRequested(id: string): boolean {
    return this.read(id).cancelRequestedAt !== null;
  }

  succeed(
    id: string,
    output: {
      result?: Record<string, unknown>;
      resultArtifactId?: string;
      safetyArtifactId?: string;
    }
  ): BackupOperationRecord {
    const current = this.read(id);
    const now = this.now();
    const operation = this.transitionTerminal(id, {
      state: 'succeeded',
      stage: 'succeeded',
      progressCurrent: current.progressTotal,
      progressTotal: current.progressTotal,
      cancellable: false,
      result: output.result ?? null,
      resultArtifactId: output.resultArtifactId ?? null,
      safetyArtifactId: output.safetyArtifactId ?? null,
      errorCode: null,
      errorDetails: null,
      now
    });
    this.notify('backup.operation.succeeded');
    return operation;
  }

  fail(
    id: string,
    errorCode: string,
    errorDetails: Record<string, unknown> | null
  ): BackupOperationRecord {
    const current = this.read(id);
    const now = this.now();
    const operation = this.transitionTerminal(id, {
      state: 'failed',
      stage: 'failed',
      progressCurrent: current.progressCurrent,
      progressTotal: current.progressTotal,
      cancellable: false,
      errorCode,
      errorDetails,
      now
    });
    this.notify('backup.operation.failed');
    return operation;
  }

  cancel(id: string): BackupOperationRecord {
    const current = this.read(id);
    const now = this.now();
    const operation = this.transitionTerminal(id, {
      state: 'cancelled',
      stage: 'cancelled',
      progressCurrent: current.progressCurrent,
      progressTotal: current.progressTotal,
      cancellable: false,
      errorCode: 'BACKUP_OPERATION_CANCELLED',
      errorDetails: null,
      now
    });
    this.notify('backup.operation.cancelled');
    return operation;
  }

  recoverInterruptedOperations(): number {
    const now = this.now();
    const count = this.repository.markActiveOperationsInterrupted(now, this.expiresAt(now));
    if (count > 0) this.notify('backup.operation.interrupted');
    return count;
  }

  private startInTransaction(input: StartOperationInput): StartOperationResult {
    const existing = this.repository.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return this.resolveIdempotent(existing, input.requestFingerprint);
    const active = this.repository.findActiveOperation();
    if (active) throw this.activeError(active);
    const now = this.now();
    return {
      operation: this.repository.createOperation({
        id: this.options.ids.randomId(),
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        kind: input.kind,
        mode: input.mode ?? null,
        state: 'queued',
        stage: input.initialStage,
        cancellable: true,
        cancelRequestedAt: null,
        progressCurrent: 0,
        progressTotal: input.progressTotal,
        errorCode: null,
        errorDetails: null,
        resultArtifactId: null,
        safetyArtifactId: null,
        result: null,
        startedAt: now,
        updatedAt: now,
        finishedAt: null,
        metadataExpiresAt: this.expiresAt(now)
      }),
      created: true
    };
  }

  private resolveIdempotent(
    existing: BackupOperationRecord,
    requestFingerprint: string
  ): StartOperationResult {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new BackupOperationError(
        'IDEMPOTENCY_KEY_REUSED',
        409,
        'Idempotency key was already used for a different request',
        false,
        { operationId: existing.id }
      );
    }
    return { operation: existing, created: false };
  }

  private activeError(active: BackupOperationRecord): BackupOperationError {
    return new BackupOperationError(
      'BACKUP_OPERATION_ACTIVE',
      409,
      'Another backup or restore operation is already running',
      true,
      { operation: this.safeSummary(active) }
    );
  }

  private safeSummary(operation: BackupOperationRecord): Record<string, unknown> {
    return {
      id: operation.id,
      kind: operation.kind,
      mode: operation.mode,
      state: operation.state,
      stage: operation.stage,
      cancellable: operation.cancellable,
      progress: {
        current: operation.progressCurrent,
        total: operation.progressTotal
      },
      startedAt: operation.startedAt,
      updatedAt: operation.updatedAt,
      finishedAt: operation.finishedAt,
      error: null,
      result: null
    };
  }

  private transitionTerminal(
    id: string,
    input: BackupOperationTransitionInput & { now: string }
  ): BackupOperationRecord {
    return this.repository.transaction(() => {
      const current = this.read(id);
      const nextState = input.state ?? current.state;
      this.assertTransition(current.state, nextState);
      return this.repository.updateOperation(id, {
        state: nextState,
        stage: input.stage,
        cancellable: input.cancellable,
        progressCurrent: input.progressCurrent ?? current.progressCurrent,
        progressTotal: input.progressTotal ?? current.progressTotal,
        errorCode: Object.hasOwn(input, 'errorCode')
          ? (input.errorCode ?? null)
          : current.errorCode,
        errorDetails: Object.hasOwn(input, 'errorDetails')
          ? (input.errorDetails ?? null)
          : current.errorDetails,
        resultArtifactId: Object.hasOwn(input, 'resultArtifactId')
          ? (input.resultArtifactId ?? null)
          : current.resultArtifactId,
        safetyArtifactId: Object.hasOwn(input, 'safetyArtifactId')
          ? (input.safetyArtifactId ?? null)
          : current.safetyArtifactId,
        result: Object.hasOwn(input, 'result') ? (input.result ?? null) : current.result,
        updatedAt: input.now,
        finishedAt: input.now,
        metadataExpiresAt: this.expiresAt(input.now)
      });
    });
  }

  private assertTransition(current: BackupOperationState, next: BackupOperationState): void {
    if (current === next) {
      if (transitions[current].length === 0) {
        throw new Error(`Backup operation is already terminal: ${current}`);
      }
      return;
    }
    if (!transitions[current].includes(next)) {
      throw new Error(`Invalid backup operation transition ${current} -> ${next}`);
    }
  }

  private assertStartInput(input: StartOperationInput): void {
    if (!input.idempotencyKey) throw new Error('Idempotency key is required');
    if (!input.requestFingerprint) throw new Error('Request fingerprint is required');
    if (!input.initialStage) throw new Error('Initial operation stage is required');
    if (!Number.isInteger(input.progressTotal) || input.progressTotal < 0) {
      throw new Error('Operation progress total must be a non-negative integer');
    }
  }

  private isConstraintError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('UNIQUE constraint failed') ||
        (error as Error & { code?: string }).code?.startsWith('SQLITE_CONSTRAINT') === true)
    );
  }

  private notify(reason: string): void {
    this.options.onChanged?.(reason);
  }

  private now(): string {
    return this.options.clock.now().toISOString();
  }

  private expiresAt(now: string): string {
    return new Date(new Date(now).getTime() + metadataRetentionMs).toISOString();
  }
}
