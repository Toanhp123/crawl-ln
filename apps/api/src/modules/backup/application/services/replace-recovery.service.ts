import type { LoggerPort } from '../../../../platform/events/outbox-dispatcher.js';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupStorePort, ReplacePromotionPaths } from '../ports/backup-store.port.js';
import type { ReplaceJournalPort } from '../ports/replace-journal.port.js';

export class ReplaceRecoveryService {
  constructor(
    private readonly store: BackupStorePort,
    private readonly journal: ReplaceJournalPort,
    private readonly repository: BackupControlRepository,
    private readonly logger: LoggerPort
  ) {}

  async reconcileOnStartup(): Promise<void> {
    const journal = await this.journal.read();
    if (!journal) return;
    const paths: ReplacePromotionPaths = {
      databasePath: journal.databasePath,
      newDatabasePath: journal.newDatabasePath,
      rollbackDatabasePath: journal.rollbackDatabasePath
    };
    const operation = this.repository.findOperation(journal.operationId);

    if (operation?.state === 'succeeded' && this.isValid(paths.databasePath)) {
      await this.store.removeDatabaseFile(paths.newDatabasePath);
      await this.store.removeDatabaseFile(paths.rollbackDatabasePath);
      await this.journal.remove();
      return;
    }

    if (this.isValid(paths.rollbackDatabasePath)) {
      await this.store.restoreRollbackDatabase(paths);
      this.store.closePrimaryDatabase();
      await this.store.removeDatabaseFile(paths.newDatabasePath);
      await this.journal.remove();
      this.markInterrupted(journal.operationId, 'rollback-restored');
      return;
    }

    if (this.isValid(paths.databasePath)) {
      await this.store.removeDatabaseFile(paths.newDatabasePath);
      await this.store.removeDatabaseFile(paths.rollbackDatabasePath);
      await this.journal.remove();
      this.markInterrupted(journal.operationId, 'promoted-current-retained', true);
      this.logger.error('backup.replace.recovery.current-only', {
        operationId: journal.operationId,
        stage: journal.stage
      });
      return;
    }

    this.logger.error('backup.replace.recovery.unrecoverable', {
      operationId: journal.operationId,
      stage: journal.stage
    });
    throw new Error('Replace recovery could not find a valid primary or rollback database');
  }

  private isValid(path: string): boolean {
    if (!this.store.fileExists(path)) return false;
    try {
      this.store.validateDatabaseFile(path);
      return true;
    } catch {
      return false;
    }
  }

  private markInterrupted(operationId: string, recoveryState: string, currentOnly = false): void {
    const operation = this.repository.findOperation(operationId);
    if (!operation) return;
    this.repository.updateOperation(operationId, {
      state: 'interrupted',
      stage: 'interrupted',
      cancellable: false,
      errorCode: currentOnly ? 'RESTORE_REPLACE_RECOVERY_FAILED' : 'BACKUP_OPERATION_INTERRUPTED',
      errorDetails: { retryable: false, state: recoveryState }
    });
  }
}
