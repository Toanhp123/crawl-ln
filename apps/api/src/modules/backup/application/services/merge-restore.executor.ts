import type { RealtimeEventPublisher } from '../../../../platform/realtime/realtime-event.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import { BackupBadRequestError, BackupOperationError } from '../errors/backup.error.js';
import type {
  BackupOperationOutput,
  BackupOperationExecutionContext,
  BackupOperationExecutor
} from './backup-operation-coordinator.js';
import type { BackupContributorCoordinator } from './backup-contributor-coordinator.js';
import type {
  BackupMergePlanner,
  BackupPlanInput,
  BackupPlanResult
} from './backup-merge-planner.js';
import type { RestorePreparationService } from './restore-preparation.service.js';

export interface RestoreExecutionSecret {
  sessionId: string;
  inspectionToken: string;
  planFingerprint: string;
  currentSettings: Record<string, unknown>;
}

type MergePlanner = Pick<BackupMergePlanner, 'createMergePlanInCurrentTransaction'>;
type MergeContributors = Pick<BackupContributorCoordinator, 'importAll'>;

const stages = [
  'preparing',
  'verifying-plan',
  'applying-library',
  'applying-source-reader',
  'applying-ingestion',
  'applying-scheduler',
  'applying-search',
  'applying-settings',
  'finalizing'
] as const;

type MergeStage = (typeof stages)[number];

const moduleStages: Record<string, MergeStage> = {
  library: 'applying-library',
  'source-reader': 'applying-source-reader',
  ingestion: 'applying-ingestion',
  scheduler: 'applying-scheduler',
  search: 'applying-search'
};

export class MergeRestoreExecutor implements BackupOperationExecutor<RestoreExecutionSecret> {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly planner: MergePlanner,
    private readonly contributors: MergeContributors,
    private readonly repository: BackupControlRepository,
    private readonly preparation: RestorePreparationService,
    private readonly files: BackupFileStore,
    private readonly realtime?: RealtimeEventPublisher
  ) {}

  static progressTotal(): number {
    return stages.length;
  }

  async execute(
    context: BackupOperationExecutionContext,
    secret: RestoreExecutionSecret
  ): Promise<BackupOperationOutput> {
    const transition = (stage: MergeStage, cancellable: boolean) =>
      context.transition({
        stage,
        progressCurrent: stages.indexOf(stage) + 1,
        progressTotal: stages.length,
        cancellable
      });

    let committed = false;
    try {
      transition('preparing', true);
      const session = this.requireLockedSession(secret.sessionId, context.operationId);
      const staged = await this.preparation.loadExecutionData(session.id);
      context.throwIfCancellationRequested();

      const boundary = transition('verifying-plan', false);
      if (boundary.cancelRequestedAt) {
        throw new BackupOperationError(
          'BACKUP_OPERATION_CANCELLED',
          409,
          'Restore operation cancellation was requested before the write transaction',
          false,
          { operationId: context.operationId }
        );
      }

      let verifiedPlan: BackupPlanResult | undefined;
      await this.database.transactionAsync(async () => {
        const input: BackupPlanInput = {
          mode: 'merge',
          settingsPolicy: session.settingsPolicy ?? 'keep-current',
          archiveChecksum: session.archiveChecksum!,
          stagedContributors: staged.contributors,
          inventory: session.inventory!
        };
        verifiedPlan = await this.planner.createMergePlanInCurrentTransaction(
          input,
          `backup-verify:${session.archiveChecksum}`
        );
        if (verifiedPlan.fingerprint !== secret.planFingerprint) {
          throw new BackupOperationError(
            'RESTORE_PLAN_STALE',
            409,
            'Restore plan is stale and must be recreated',
            true,
            {
              sessionId: session.id,
              expected: secret.planFingerprint,
              actual: verifiedPlan.fingerprint
            }
          );
        }

        await this.contributors.importAll(staged.contributors, {
          importId: `backup-apply:${context.operationId}`,
          onBeforeContributor: (module) => {
            const stage = moduleStages[module];
            if (stage) transition(stage, false);
          }
        });
        transition('applying-settings', false);
      });
      committed = true;

      transition('finalizing', false);
      return {
        onSucceeded: async () => {
          await this.preparation.consumeExecution(session.id);
        },
        result: {
          restoreMode: 'merge',
          settingsPolicy: session.settingsPolicy,
          impact: verifiedPlan!.plan.impact,
          settingsPending: session.settingsPolicy === 'use-backup'
        }
      };
    } catch (error) {
      if (!committed) await this.handleFailure(secret.sessionId, error);
      throw error;
    } finally {
      secret.inspectionToken = '';
      secret.currentSettings = {};
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
    if (session.state !== 'locked' || session.lockedOperationId !== operationId) {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not locked by this operation',
        false,
        { sessionId, state: session.state, operationId }
      );
    }
    if (!session.archiveChecksum || !session.inventory || !session.mergePlanFingerprint) {
      throw new BackupOperationError(
        'RESTORE_PLAN_UNAVAILABLE',
        409,
        'Restore execution plan is unavailable',
        false,
        { sessionId }
      );
    }
    return session;
  }

  private async handleFailure(sessionId: string, error: unknown): Promise<void> {
    const session = this.repository.findRestoreSession(sessionId);
    if (!session || session.state !== 'locked') return;
    if (error instanceof BackupOperationError && error.code === 'RESTORE_PLAN_STALE') {
      this.preparation.unlockExecution(sessionId, { clearPlan: true, stage: 'plan-stale' });
      return;
    }
    if (error instanceof BackupOperationError && error.code === 'BACKUP_OPERATION_CANCELLED') {
      this.preparation.unlockExecution(sessionId, { clearPlan: false, stage: 'ready' });
      return;
    }
    if (
      error instanceof BackupOperationError &&
      ['BACKUP_STAGING_INVALID', 'BACKUP_ARCHIVE_UNSAFE'].includes(error.code)
    ) {
      await this.preparation.invalidateExecution(sessionId, error.code);
      return;
    }
    if (error instanceof BackupBadRequestError) {
      await this.preparation.invalidateExecution(sessionId, 'BACKUP_STAGING_INVALID');
      return;
    }
    this.preparation.unlockExecution(sessionId, { clearPlan: false, stage: 'ready' });
  }
}
