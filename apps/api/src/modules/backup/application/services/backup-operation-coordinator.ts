import type { LoggerPort } from '../../../../platform/events/outbox-dispatcher.js';
import { BackupOperationError } from '../errors/backup.error.js';
import type {
  BackupOperationRecord,
  StartOperationInput
} from '../../domain/backup-operation.models.js';
import type { BackupOperationService } from './backup-operation.service.js';

const persistedFailureDetailKeys = new Set([
  'operationId',
  'artifactId',
  'sessionId',
  'kind',
  'mode',
  'state',
  'stage',
  'expected',
  'actual',
  'limit',
  'receivedBytes',
  'expectedBytes',
  'attemptsRemaining',
  'retryAfterSeconds',
  'module',
  'schemaVersion',
  'supportedSchemaVersion'
]);

type PersistedDetailValue =
  string | number | boolean | null | Array<string | number | boolean | null>;

function persistedDetailValue(value: unknown): PersistedDetailValue | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, 500);
  if (!Array.isArray(value) || value.length > 20) return undefined;
  const items: Array<string | number | boolean | null> = [];
  for (const item of value) {
    const parsed = persistedDetailValue(item);
    if (Array.isArray(parsed) || parsed === undefined) return undefined;
    items.push(parsed);
  }
  return items;
}

function filteredFailureDetails(error: BackupOperationError): Record<string, unknown> {
  const filtered: Record<string, unknown> = { retryable: error.retryable };
  for (const [key, value] of Object.entries(error.details ?? {})) {
    if (!persistedFailureDetailKeys.has(key)) continue;
    const parsed = persistedDetailValue(value);
    if (parsed !== undefined) filtered[key] = parsed;
  }
  return filtered;
}

export interface BackupOperationExecutionContext {
  readonly operationId: string;
  transition(input: {
    stage: string;
    progressCurrent: number;
    progressTotal: number;
    cancellable: boolean;
    resultArtifactId?: string | null;
    safetyArtifactId?: string | null;
    result?: Record<string, unknown> | null;
  }): BackupOperationRecord;
  cancellationRequested(): boolean;
  throwIfCancellationRequested(): void;
}

export interface BackupOperationOutput {
  result?: Record<string, unknown>;
  resultArtifactId?: string;
  safetyArtifactId?: string;
  onSucceeded?: () => Promise<void> | void;
}

export interface BackupOperationExecutor<Secret> {
  execute(context: BackupOperationExecutionContext, secret: Secret): Promise<BackupOperationOutput>;
  afterSuccess?(output: BackupOperationOutput): Promise<void> | void;
}

export class BackupOperationCoordinator {
  constructor(
    private readonly operations: BackupOperationService,
    private readonly logger: LoggerPort
  ) {}

  start<Secret>(
    input: StartOperationInput,
    executor: BackupOperationExecutor<Secret>,
    secret: Secret
  ): BackupOperationRecord {
    const started = this.operations.start(input);
    if (!started.created) return started.operation;
    this.schedule(started.operation, executor, secret);
    return started.operation;
  }

  schedule<Secret>(
    operation: BackupOperationRecord,
    executor: BackupOperationExecutor<Secret>,
    secret: Secret
  ): void {
    let secretReference: Secret | undefined = secret;
    queueMicrotask(() => {
      void this.run(operation, executor, secretReference as Secret)
        .catch((error) => {
          this.logger.error('backup.operation.unhandled', {
            operationId: operation.id,
            errorClass: error instanceof Error ? error.name : typeof error
          });
        })
        .finally(() => {
          secretReference = undefined;
        });
    });
  }

  private async run<Secret>(
    operation: BackupOperationRecord,
    executor: BackupOperationExecutor<Secret>,
    secret: Secret
  ): Promise<void> {
    try {
      this.operations.markRunning(operation.id);
      const context = this.executionContext(operation.id);
      context.throwIfCancellationRequested();
      const output = await executor.execute(context, secret);
      context.throwIfCancellationRequested();
      this.operations.succeed(operation.id, output);
      try {
        await output.onSucceeded?.();
      } catch (error) {
        this.logger.error('backup.operation.success-cleanup.failed', {
          operationId: operation.id,
          errorClass: error instanceof Error ? error.name : typeof error
        });
      }
      try {
        await executor.afterSuccess?.(output);
      } catch (error) {
        this.logger.error('backup.operation.success-notification.failed', {
          operationId: operation.id,
          errorClass: error instanceof Error ? error.name : typeof error
        });
      }
    } catch (error) {
      if (error instanceof BackupOperationError && error.code === 'BACKUP_OPERATION_CANCELLED') {
        this.operations.cancel(operation.id);
        return;
      }
      if (error instanceof BackupOperationError) {
        this.operations.fail(operation.id, error.code, filteredFailureDetails(error));
        return;
      }
      this.logger.error('backup.operation.failed', {
        operationId: operation.id,
        errorClass: error instanceof Error ? error.name : typeof error
      });
      this.operations.fail(operation.id, 'INTERNAL_ERROR', null);
    }
  }

  private executionContext(operationId: string): BackupOperationExecutionContext {
    return {
      operationId,
      transition: (input) => this.operations.transition(operationId, input),
      cancellationRequested: () => this.operations.cancellationRequested(operationId),
      throwIfCancellationRequested: () => {
        if (!this.operations.cancellationRequested(operationId)) return;
        throw new BackupOperationError(
          'BACKUP_OPERATION_CANCELLED',
          409,
          'Backup operation cancellation was requested',
          false,
          { operationId }
        );
      }
    };
  }
}
