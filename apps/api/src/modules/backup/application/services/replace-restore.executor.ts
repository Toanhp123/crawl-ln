import type { LoggerPort } from '../../../../platform/events/outbox-dispatcher.js';
import type { RealtimeEventPublisher } from '../../../../platform/realtime/realtime-event.js';
import { BackupBadRequestError, BackupOperationError } from '../errors/backup.error.js';
import type { BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import type { BackupMaintenancePort } from '../ports/backup-maintenance.port.js';
import type { BackupStorePort, ReplacePromotionPaths } from '../ports/backup-store.port.js';
import type { ReplaceJournal, ReplaceJournalPort } from '../ports/replace-journal.port.js';
import type { CreateBackupCommandHandler } from '../commands/create-backup.command.js';
import type {
  BackupOperationExecutionContext,
  BackupOperationExecutor,
  BackupOperationOutput
} from './backup-operation-coordinator.js';
import type { BackupArtifactService } from './backup-artifact.service.js';
import type { RestorePreparationService } from './restore-preparation.service.js';
import type { RestoreExecutionSecret } from './merge-restore.executor.js';

const stages = [
  'safety-backup',
  'preparing-staging',
  'validating-staging',
  'entering-maintenance',
  'promoting-database',
  'reopening-database',
  'post-promote-validation',
  'finalizing'
] as const;

type ReplaceStage = (typeof stages)[number];

type SafetyBackupCommand = Pick<CreateBackupCommandHandler, 'execute'>;
type ArtifactService = Pick<BackupArtifactService, 'createFromOperation'>;

type ReplaceFiles = Pick<BackupFileStore, 'writeOperationFile' | 'removeOperationRoot'>;

export class ReplaceRestoreExecutor implements BackupOperationExecutor<RestoreExecutionSecret> {
  constructor(
    private readonly store: BackupStorePort,
    private readonly maintenance: BackupMaintenancePort,
    private readonly createBackup: SafetyBackupCommand,
    private readonly archive: BackupArchivePort,
    private readonly artifacts: ArtifactService,
    private readonly files: ReplaceFiles,
    private readonly journal: ReplaceJournalPort,
    private readonly repository: BackupControlRepository,
    private readonly preparation: RestorePreparationService,
    private readonly logger: LoggerPort,
    private readonly realtime?: RealtimeEventPublisher
  ) {}

  static progressTotal(): number {
    return stages.length;
  }

  async execute(
    context: BackupOperationExecutionContext,
    secret: RestoreExecutionSecret
  ): Promise<BackupOperationOutput> {
    const transition = (
      stage: ReplaceStage,
      cancellable: boolean,
      extra: { safetyArtifactId?: string } = {}
    ) =>
      context.transition({
        stage,
        progressCurrent: stages.indexOf(stage) + 1,
        progressTotal: stages.length,
        cancellable,
        ...extra
      });

    let promotion: ReplacePromotionPaths | undefined;
    let journalValue: ReplaceJournal | undefined;
    let crossedBoundary = false;
    let rollbackCompleted = false;
    let promotionValidated = false;
    let safetyArtifactId: string | undefined;
    let succeeded = false;
    try {
      const session = this.requireLockedSession(secret.sessionId, context.operationId);
      transition('safety-backup', true);
      const safety = await this.createBackup.execute({
        password: undefined,
        settings: secret.currentSettings
      });
      await this.archive.open(safety.content);
      const sourcePath = await this.files.writeOperationFile(
        context.operationId,
        'safety-backup.nvt',
        safety.content
      );
      const artifact = await this.artifacts.createFromOperation({
        operationId: context.operationId,
        kind: 'safety-backup',
        sourcePath,
        filename: safety.filename.replace('backup-', 'safety-backup-'),
        encrypted: false
      });
      safetyArtifactId = artifact.id;
      transition('safety-backup', true, { safetyArtifactId });
      context.throwIfCancellationRequested();

      transition('preparing-staging', true, { safetyArtifactId });
      const staged = await this.preparation.loadExecutionData(session.id);
      promotion = await this.store.prepareReplacement({
        operationId: context.operationId,
        validatedDatabasePath: staged.databasePath
      });
      transition('validating-staging', true, { safetyArtifactId });
      this.store.validateDatabaseFile(promotion.newDatabasePath);
      context.throwIfCancellationRequested();

      const boundary = transition('entering-maintenance', false, { safetyArtifactId });
      if (boundary.cancelRequestedAt) {
        throw new BackupOperationError(
          'BACKUP_OPERATION_CANCELLED',
          409,
          'Restore operation cancellation was requested before maintenance',
          false,
          { operationId: context.operationId }
        );
      }

      journalValue = {
        version: 1,
        operationId: context.operationId,
        databasePath: promotion.databasePath,
        newDatabasePath: promotion.newDatabasePath,
        rollbackDatabasePath: promotion.rollbackDatabasePath,
        stage: 'prepared'
      };
      await this.journal.write(journalValue);
      crossedBoundary = true;

      await this.maintenance.runExclusive(async () => {
        try {
          this.store.closePrimaryDatabase();
          await this.store.movePrimaryToRollback(promotion!);
          journalValue = { ...journalValue!, stage: 'old-moved' };
          await this.journal.write(journalValue);

          transition('promoting-database', false, { safetyArtifactId });
          await this.store.promotePreparedDatabase(promotion!);
          journalValue = { ...journalValue!, stage: 'new-promoted' };
          await this.journal.write(journalValue);

          transition('reopening-database', false, { safetyArtifactId });
          this.store.openPrimaryDatabase();
          journalValue = { ...journalValue!, stage: 'reopened' };
          await this.journal.write(journalValue);

          transition('post-promote-validation', false, { safetyArtifactId });
          this.store.validateDatabaseFile(promotion!.databasePath);
          promotionValidated = true;
        } catch (error) {
          try {
            await this.rollbackWithinMaintenance(promotion!);
            rollbackCompleted = true;
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              'Replace promotion and synchronous rollback failed'
            );
          }
          throw error;
        }
      });

      transition('finalizing', false, { safetyArtifactId });
      succeeded = true;
      return {
        safetyArtifactId,
        result: {
          restoreMode: 'replace',
          settingsPolicy: session.settingsPolicy,
          impact: session.mergePlan!.impact,
          settingsPending: session.settingsPolicy === 'use-backup',
          expiresAt: artifact.expiresAt
        },
        onSucceeded: async () => {
          await this.preparation.consumeExecution(session.id);
          await this.store.cleanupReplacement(promotion!).catch((error) => {
            this.logger.error('backup.replace.cleanup.failed', {
              operationId: context.operationId,
              errorClass: error instanceof Error ? error.name : typeof error
            });
          });
          await this.journal.remove().catch((error) => {
            this.logger.error('backup.replace.journal.cleanup.failed', {
              operationId: context.operationId,
              errorClass: error instanceof Error ? error.name : typeof error
            });
          });
          await this.files.removeOperationRoot(context.operationId).catch((error) => {
            this.logger.error('backup.replace.scratch.cleanup.failed', {
              operationId: context.operationId,
              errorClass: error instanceof Error ? error.name : typeof error
            });
          });
        }
      };
    } catch (error) {
      if (!succeeded) {
        const cleanupError = await this.handleFailure({
          sessionId: secret.sessionId,
          error,
          promotion,
          crossedBoundary,
          rollbackCompleted,
          promotionValidated,
          journalStage: journalValue?.stage,
          operationId: context.operationId
        });
        if (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Replace restore failed and rollback/restart cleanup also failed'
          );
        }
      }
      throw error;
    } finally {
      secret.inspectionToken = '';
      secret.currentSettings = {};
      if (!succeeded) {
        await this.files.removeOperationRoot(context.operationId).catch(() => undefined);
      }
    }
  }

  afterSuccess(): void {
    this.realtime?.publish({
      type: 'data.changed',
      resources: ['all'],
      reason: 'backup.restore.committed'
    });
  }

  private requireLockedSession(sessionId: string, operationId: string) {
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
    if (
      session.state !== 'locked' ||
      session.lockedOperationId !== operationId ||
      session.selectedMode !== 'replace' ||
      !session.mergePlan
    ) {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not locked for Replace execution',
        false,
        { sessionId, state: session.state, operationId }
      );
    }
    return session;
  }

  private async rollbackWithinMaintenance(promotion: ReplacePromotionPaths): Promise<void> {
    if (this.store.fileExists(promotion.rollbackDatabasePath)) {
      await this.store.restoreRollbackDatabase(promotion);
    } else {
      if (!this.store.fileExists(promotion.databasePath)) {
        throw new Error('Replace rollback could not find the primary database');
      }
      this.store.openPrimaryDatabase();
      this.store.validateDatabaseFile(promotion.databasePath);
      await this.store.removeDatabaseFile(promotion.newDatabasePath);
    }
    await this.journal.remove();
  }

  private async handleFailure(input: {
    sessionId: string;
    operationId: string;
    error: unknown;
    promotion?: ReplacePromotionPaths;
    crossedBoundary: boolean;
    rollbackCompleted: boolean;
    promotionValidated: boolean;
    journalStage?: ReplaceJournal['stage'];
  }): Promise<unknown | null> {
    if (!input.crossedBoundary) {
      if (input.error instanceof BackupBadRequestError) {
        await this.preparation.invalidateExecution(input.sessionId, 'BACKUP_STAGING_INVALID');
      } else {
        this.preparation.unlockExecution(input.sessionId, { clearPlan: false, stage: 'ready' });
      }
      if (input.promotion) {
        await this.store.cleanupReplacement(input.promotion).catch(() => undefined);
      }
      return null;
    }

    if (
      !input.rollbackCompleted &&
      !input.promotionValidated &&
      input.journalStage === 'prepared' &&
      input.promotion &&
      this.store.fileExists(input.promotion.databasePath) &&
      !this.store.fileExists(input.promotion.rollbackDatabasePath)
    ) {
      await this.store.cleanupReplacement(input.promotion).catch(() => undefined);
      await this.journal.remove().catch(() => undefined);
    }

    await this.preparation.invalidateExecution(input.sessionId, 'RESTORE_REPLACE_RECOVERY_FAILED');
    return null;
  }
}
