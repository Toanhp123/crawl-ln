import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { BackupContributor } from '../../platform/backup/backup-contributor.js';
import { MigrationRegistry } from '../../platform/database/migration-registry.js';
import { runRegisteredMigrations } from '../../platform/database/migration-runner.js';
import type { SqliteDatabase as PrimarySqliteDatabase } from '../../platform/database/sqlite-database.js';
import { SqliteDatabase } from '../../platform/database/sqlite-database.js';
import type { LoggerPort } from '../../platform/events/outbox-dispatcher.js';
import type { RealtimeEventPublisher } from '../../platform/realtime/realtime-event.js';
import { CreateBackupCommandHandler } from './application/commands/create-backup.command.js';
import { BackupOperationError } from './application/errors/backup.error.js';
import type { BackupMaintenancePort } from './application/ports/backup-maintenance.port.js';
import { BackupArtifactService } from './application/services/backup-artifact.service.js';
import { BackupCleanupService } from './application/services/backup-cleanup.service.js';
import { BackupContributorCoordinator } from './application/services/backup-contributor-coordinator.js';
import { BackupOperationCoordinator } from './application/services/backup-operation-coordinator.js';
import { BackupOperationService } from './application/services/backup-operation.service.js';
import { CreateBackupOperationExecutor } from './application/services/create-backup-operation.executor.js';
import { BackupInventoryReader } from './application/services/backup-inventory.reader.js';
import { BackupMergePlanner } from './application/services/backup-merge-planner.js';
import { BackupSchemaMigrator } from './application/services/backup-schema-migrator.js';
import { RestoreInspectionCoordinator } from './application/services/restore-inspection.coordinator.js';
import { RestoreInspectionService } from './application/services/restore-inspection.service.js';
import { RestorePreparationService } from './application/services/restore-preparation.service.js';
import { MergeRestoreExecutor } from './application/services/merge-restore.executor.js';
import { ReplaceRestoreExecutor } from './application/services/replace-restore.executor.js';
import { ReplaceRecoveryService } from './application/services/replace-recovery.service.js';
import { RestoreExecutionService } from './application/services/restore-execution.service.js';
import { JsZipBackupArchive } from './infrastructure/archive/jszip-backup.archive.js';
import { backupControlMigrations } from './infrastructure/control/backup-control.migrations.js';
import { SqliteBackupControlRepository } from './infrastructure/control/sqlite-backup-control.repository.js';
import { NodeBackupFileStore } from './infrastructure/filesystem/node-backup-file.store.js';
import { NodeReplaceJournalStore } from './infrastructure/filesystem/node-replace-journal.store.js';
import { SqliteBackupStore } from './infrastructure/sqlite/sqlite-backup.store.js';
import type { BackupApi } from './public/backup.api.js';

interface BackupModuleOptions {
  database: PrimarySqliteDatabase;
  databasePath: string;
  storageDirectory: string;
  contributors: readonly BackupContributor[];
  clock: { now(): Date };
  ids?: { randomId(): string };
  logger?: LoggerPort;
  realtime?: RealtimeEventPublisher;
  appVersion: string;
  schemaVersion: number;
  maintenance?: BackupMaintenancePort;
  primaryMigrations?: MigrationRegistry;
}

export function createBackupModule(options: BackupModuleOptions) {
  const storageDirectory = resolve(options.storageDirectory);
  const ids = options.ids ?? { randomId: randomUUID };
  const logger = options.logger ?? { error: () => undefined };
  const store = new SqliteBackupStore(options.database, options.databasePath, storageDirectory);
  const contributors = new BackupContributorCoordinator(options.contributors);
  const archive = new JsZipBackupArchive({
    appVersion: options.appVersion,
    schemaVersion: options.schemaVersion
  });
  const create = new CreateBackupCommandHandler(store, contributors, archive, options.clock);
  const maintenance = options.maintenance ?? {
    runExclusive: <T>(work: () => Promise<T>) => work()
  };
  const controlDatabase = new SqliteDatabase(resolve(storageDirectory, 'backup-control.sqlite'), {
    open: false
  });
  const repository = new SqliteBackupControlRepository(controlDatabase);
  const files = new NodeBackupFileStore(storageDirectory);
  const operations = new BackupOperationService(repository, {
    clock: options.clock,
    ids,
    onChanged(reason) {
      options.realtime?.publish({
        type: 'data.changed',
        resources: ['backup'],
        reason
      });
    }
  });
  const operationCoordinator = new BackupOperationCoordinator(operations, logger);
  const artifacts = new BackupArtifactService(repository, files, {
    clock: options.clock,
    ids
  });
  const cleanup = new BackupCleanupService(repository, files, {
    clock: options.clock,
    logger
  });
  const createOperation = new CreateBackupOperationExecutor(create, artifacts, files);
  const mergePlanner = new BackupMergePlanner(options.database, contributors, options.clock);
  const restorePreparation = new RestorePreparationService(
    repository,
    files,
    {
      clock: options.clock,
      ids,
      onChanged(reason) {
        options.realtime?.publish({
          type: 'data.changed',
          resources: ['backup'],
          reason
        });
      }
    },
    mergePlanner
  );
  const schemaMigrator = new BackupSchemaMigrator(
    options.primaryMigrations ?? new MigrationRegistry()
  );
  const inventoryReader = new BackupInventoryReader();
  const restoreInspection = new RestoreInspectionService(
    repository,
    files,
    archive,
    restorePreparation,
    schemaMigrator,
    inventoryReader,
    options.clock
  );
  const restoreInspectionCoordinator = new RestoreInspectionCoordinator(restoreInspection, logger);
  const replaceJournal = new NodeReplaceJournalStore(storageDirectory);
  const mergeRestore = new MergeRestoreExecutor(
    options.database,
    mergePlanner,
    contributors,
    repository,
    restorePreparation,
    files,
    options.realtime
  );
  const replaceRestore = new ReplaceRestoreExecutor(
    store,
    maintenance,
    create,
    archive,
    artifacts,
    files,
    replaceJournal,
    repository,
    restorePreparation,
    logger,
    options.realtime
  );
  const restoreExecution = new RestoreExecutionService(
    repository,
    operations,
    operationCoordinator,
    restorePreparation,
    mergeRestore,
    replaceRestore,
    { clock: options.clock, ids }
  );
  const replaceRecovery = new ReplaceRecoveryService(store, replaceJournal, repository, logger);

  const api: BackupApi = {
    commands: {
      create: (input) => create.execute(input)
    },
    operations: {
      startBackup(input) {
        if (input.encryption.enabled && input.encryption.password.length < 8) {
          throw new BackupOperationError(
            'BACKUP_PASSWORD_TOO_SHORT',
            422,
            'Backup password must contain at least 8 characters',
            false
          );
        }
        if (!input.encryption.enabled && !input.confirmation.unencryptedAccepted) {
          throw new BackupOperationError(
            'BACKUP_UNENCRYPTED_CONFIRMATION_REQUIRED',
            422,
            'Unencrypted backup confirmation is required',
            false
          );
        }
        const password = input.encryption.enabled ? input.encryption.password : undefined;
        return operationCoordinator.start(
          {
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            kind: 'backup',
            initialStage: 'queued',
            progressTotal: CreateBackupOperationExecutor.progressTotal(Boolean(password))
          },
          createOperation,
          { password, settings: input.settings }
        );
      },
      startRestore: (input) => restoreExecution.start(input),
      current: () => operations.current(),
      read: (operationId) => operations.read(operationId),
      cancel: (operationId) => operations.requestCancel(operationId),
      issueDownloadToken: (operationId, artifactId) =>
        artifacts.issueDownloadToken(operationId, artifactId),
      acceptDownloadToken(token) {
        const artifact = artifacts.acceptDownloadToken(token);
        return {
          filename: artifact.filename,
          sizeBytes: artifact.sizeBytes,
          stream: files.openReadStream(artifact.path)
        };
      }
    }
  };

  let controlReady = false;
  let started = false;
  const beforeDatabaseOpen = async () => {
    if (controlReady) return;
    controlDatabase.open();
    try {
      const migrations = new MigrationRegistry();
      migrations.register('backup-control', backupControlMigrations);
      runRegisteredMigrations(controlDatabase, migrations);
      await files.initialize();
      operations.recoverInterruptedOperations();
      await replaceRecovery.reconcileOnStartup();
      controlReady = true;
    } catch (error) {
      controlDatabase.close();
      throw error;
    }
  };

  return {
    name: 'backup',
    migrations: [],
    api,
    restorePreparation,
    restoreInspection,
    restoreInspectionCoordinator,
    restoreExecution,
    beforeDatabaseOpen,
    async start() {
      if (started) return;
      await beforeDatabaseOpen();
      try {
        await restorePreparation.reconcileUpload();
        const resumableInspections = await restoreInspection.recoverInterruptedInspections();
        await cleanup.run();
        for (const sessionId of resumableInspections) {
          restoreInspectionCoordinator.schedule(sessionId);
        }
        started = true;
      } catch (error) {
        repository.close();
        controlReady = false;
        throw error;
      }
    },
    async stop() {
      if (!started && !controlReady) return;
      started = false;
      controlReady = false;
      repository.close();
    }
  };
}

export type BackupModule = ReturnType<typeof createBackupModule>;
