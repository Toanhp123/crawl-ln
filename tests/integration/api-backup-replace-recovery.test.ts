import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ReplaceRecoveryService } from '../../apps/api/src/modules/backup/application/services/replace-recovery.service.ts';
import { NodeReplaceJournalStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-replace-journal.store.ts';
import { SqliteBackupStore } from '../../apps/api/src/modules/backup/infrastructure/sqlite/sqlite-backup.store.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';

function createDatabase(path: string, marker: string): void {
  const database = new SqliteDatabase(path);
  database.connection.exec(`
    CREATE TABLE platform_module_migrations(module TEXT NOT NULL, version INTEGER NOT NULL);
    CREATE TABLE recovery_marker(value TEXT NOT NULL);
  `);
  database.connection.prepare('INSERT INTO recovery_marker(value) VALUES(?)').run(marker);
  database.close();
}

function readMarker(path: string): string {
  const database = new SqliteDatabase(path);
  try {
    return (
      database.connection.prepare('SELECT value FROM recovery_marker').get() as { value: string }
    ).value;
  } finally {
    database.close();
  }
}

test('replace journal writes atomically and round-trips only server paths', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-replace-journal-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const journal = new NodeReplaceJournalStore(root);
  const value = {
    version: 1 as const,
    operationId: 'replace-operation-1',
    databasePath: join(root, 'data.sqlite'),
    newDatabasePath: join(root, 'data.sqlite.restore-replace-operation-1.new'),
    rollbackDatabasePath: join(root, 'data.sqlite.restore-replace-operation-1.rollback'),
    stage: 'new-promoted' as const
  };

  await journal.write(value);
  assert.deepEqual(await journal.read(), value);
  assert.doesNotMatch(await readFile(journal.path, 'utf8'), /token|password|settings/i);
  await journal.remove();
  assert.equal(await journal.read(), null);
});

test('startup recovery restores a valid rollback database before primary open', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-replace-recovery-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const primaryPath = join(root, 'data.sqlite');
  const rollbackPath = `${primaryPath}.restore-replace-operation-1.rollback`;
  const newPath = `${primaryPath}.restore-replace-operation-1.new`;
  createDatabase(primaryPath, 'promoted');
  createDatabase(rollbackPath, 'rollback');
  createDatabase(newPath, 'candidate');

  const primary = new SqliteDatabase(primaryPath, { open: false });
  const store = new SqliteBackupStore(primary, primaryPath, root);
  const journal = new NodeReplaceJournalStore(root);
  await journal.write({
    version: 1,
    operationId: 'replace-operation-1',
    databasePath: primaryPath,
    newDatabasePath: newPath,
    rollbackDatabasePath: rollbackPath,
    stage: 'new-promoted'
  });
  const control = await createBackupControlFixture(context);
  control.repository.createOperation({
    id: 'replace-operation-1',
    idempotencyKey: 'replace-request-1',
    requestFingerprint: 'fingerprint',
    kind: 'restore',
    mode: 'replace',
    state: 'interrupted',
    stage: 'interrupted',
    cancellable: false,
    cancelRequestedAt: null,
    progressCurrent: 5,
    progressTotal: 9,
    errorCode: 'BACKUP_OPERATION_INTERRUPTED',
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: null,
    result: null,
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:01.000Z',
    finishedAt: '2026-07-25T00:00:01.000Z',
    metadataExpiresAt: '2026-08-01T00:00:00.000Z'
  });

  const recovery = new ReplaceRecoveryService(store, journal, control.repository, {
    error: () => undefined
  });
  await recovery.reconcileOnStartup();

  assert.equal(readMarker(primaryPath), 'rollback');
  assert.equal(store.fileExists(rollbackPath), false);
  assert.equal(store.fileExists(newPath), false);
  assert.equal(await journal.read(), null);
});

test('startup recovery preserves a validated Replace already marked succeeded', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-replace-succeeded-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const primaryPath = join(root, 'data.sqlite');
  const rollbackPath = `${primaryPath}.restore-replace-operation-success.rollback`;
  const newPath = `${primaryPath}.restore-replace-operation-success.new`;
  createDatabase(primaryPath, 'promoted');
  createDatabase(rollbackPath, 'rollback');
  const primary = new SqliteDatabase(primaryPath, { open: false });
  const store = new SqliteBackupStore(primary, primaryPath, root);
  const journal = new NodeReplaceJournalStore(root);
  await journal.write({
    version: 1,
    operationId: 'replace-operation-success',
    databasePath: primaryPath,
    newDatabasePath: newPath,
    rollbackDatabasePath: rollbackPath,
    stage: 'reopened'
  });
  const control = await createBackupControlFixture(context);
  control.repository.createOperation({
    id: 'replace-operation-success',
    idempotencyKey: 'replace-request-success',
    requestFingerprint: 'fingerprint-success',
    kind: 'restore',
    mode: 'replace',
    state: 'succeeded',
    stage: 'succeeded',
    cancellable: false,
    cancelRequestedAt: null,
    progressCurrent: 8,
    progressTotal: 8,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: 'safety-artifact-success',
    result: { restoreMode: 'replace' },
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:01.000Z',
    finishedAt: '2026-07-25T00:00:01.000Z',
    metadataExpiresAt: '2026-08-01T00:00:00.000Z'
  });

  const recovery = new ReplaceRecoveryService(store, journal, control.repository, {
    error: () => undefined
  });
  await recovery.reconcileOnStartup();

  assert.equal(readMarker(primaryPath), 'promoted');
  assert.equal(store.fileExists(rollbackPath), false);
  assert.equal(await journal.read(), null);
  assert.equal(control.repository.findOperation('replace-operation-success')?.state, 'succeeded');
});

test('startup recovery marks a previously succeeded Replace interrupted when rollback is restored', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-replace-succeeded-rollback-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const primaryPath = join(root, 'data.sqlite');
  const rollbackPath = `${primaryPath}.restore-replace-operation-succeeded-rollback.rollback`;
  const newPath = `${primaryPath}.restore-replace-operation-succeeded-rollback.new`;
  createDatabase(rollbackPath, 'rollback');

  const primary = new SqliteDatabase(primaryPath, { open: false });
  const store = new SqliteBackupStore(primary, primaryPath, root);
  const journal = new NodeReplaceJournalStore(root);
  await journal.write({
    version: 1,
    operationId: 'replace-operation-succeeded-rollback',
    databasePath: primaryPath,
    newDatabasePath: newPath,
    rollbackDatabasePath: rollbackPath,
    stage: 'reopened'
  });
  const control = await createBackupControlFixture(context);
  control.repository.createOperation({
    id: 'replace-operation-succeeded-rollback',
    idempotencyKey: 'replace-request-succeeded-rollback',
    requestFingerprint: 'fingerprint-succeeded-rollback',
    kind: 'restore',
    mode: 'replace',
    state: 'succeeded',
    stage: 'succeeded',
    cancellable: false,
    cancelRequestedAt: null,
    progressCurrent: 8,
    progressTotal: 8,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: 'safety-artifact-succeeded-rollback',
    result: { restoreMode: 'replace' },
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:01.000Z',
    finishedAt: '2026-07-25T00:00:01.000Z',
    metadataExpiresAt: '2026-08-01T00:00:00.000Z'
  });

  const recovery = new ReplaceRecoveryService(store, journal, control.repository, {
    error: () => undefined
  });
  await recovery.reconcileOnStartup();

  assert.equal(readMarker(primaryPath), 'rollback');
  const operation = control.repository.findOperation('replace-operation-succeeded-rollback');
  assert.equal(operation?.state, 'interrupted');
  assert.equal(operation?.stage, 'interrupted');
  assert.equal(operation?.errorCode, 'BACKUP_OPERATION_INTERRUPTED');
});

test('startup recovery keeps a valid promoted current only when rollback is absent', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-replace-current-only-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const primaryPath = join(root, 'data.sqlite');
  const rollbackPath = `${primaryPath}.restore-replace-operation-2.rollback`;
  const newPath = `${primaryPath}.restore-replace-operation-2.new`;
  createDatabase(primaryPath, 'promoted');
  const primary = new SqliteDatabase(primaryPath, { open: false });
  const store = new SqliteBackupStore(primary, primaryPath, root);
  const journal = new NodeReplaceJournalStore(root);
  await journal.write({
    version: 1,
    operationId: 'replace-operation-2',
    databasePath: primaryPath,
    newDatabasePath: newPath,
    rollbackDatabasePath: rollbackPath,
    stage: 'reopened'
  });
  const control = await createBackupControlFixture(context);

  const recovery = new ReplaceRecoveryService(store, journal, control.repository, {
    error: () => undefined
  });
  await recovery.reconcileOnStartup();

  assert.equal(readMarker(primaryPath), 'promoted');
  assert.equal(await journal.read(), null);
});

import { readFile as readFileBuffer } from 'node:fs/promises';
import { BackupMaintenanceCoordinator } from '../../apps/api/src/platform/lifecycle/backup-maintenance.coordinator.ts';
import { ReplaceRestoreExecutor } from '../../apps/api/src/modules/backup/application/services/replace-restore.executor.ts';
import { RestorePreparationService } from '../../apps/api/src/modules/backup/application/services/restore-preparation.service.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import type { BackupOperationExecutionContext } from '../../apps/api/src/modules/backup/application/services/backup-operation-coordinator.ts';
import type { BackupStorePort } from '../../apps/api/src/modules/backup/application/ports/backup-store.port.ts';
import type { RestoreSessionRecord } from '../../apps/api/src/modules/backup/domain/restore-session.models.ts';

function replaceSession(id: string): RestoreSessionRecord {
  const stamp = '2026-07-25T16:00:00.000Z';
  return {
    id,
    sessionTokenHash: '1'.repeat(64),
    inspectionTokenHash: '2'.repeat(64),
    state: 'locked',
    stage: 'locked',
    originalFilename: 'replace.nvt',
    expectedBytes: 100,
    receivedBytes: 100,
    fileFingerprint: `sha256-partial-v1:${'3'.repeat(64)}`,
    archiveChecksum: '4'.repeat(64),
    encrypted: false,
    passwordFailures: 0,
    inventory: {
      createdAt: stamp,
      appVersion: 'test',
      schemaVersion: 2,
      archiveSizeBytes: 100,
      encrypted: false,
      library: { novels: 1, analyzedNovels: 1, chapters: 0, fetchedChapters: 0 },
      sources: { plugins: 0, credentials: 0, networkProfiles: 0 },
      ingestion: { tasks: 0, events: 0 },
      scheduler: { policies: 0, diagnostics: 0 },
      search: { indexedDocuments: 0 },
      settings: { groups: [], count: 0 }
    },
    compatibility: {
      formatVersion: 3,
      sourceSchemaVersion: 2,
      targetSchemaVersion: 2,
      minimumSupportedSchemaVersion: 1,
      upgradedFrom: null,
      compatible: true
    },
    mergePlan: {
      mode: 'replace',
      settingsPolicy: 'keep-current',
      archiveChecksum: '4'.repeat(64),
      targetFingerprint: null,
      contributorImpact: {},
      impact: {
        novelsNew: 0,
        novelsExisting: 0,
        chaptersAdded: 0,
        chaptersSkipped: 0,
        sourceRemaps: 0,
        tasksRestored: 0,
        schedulerPoliciesRestored: 0,
        searchDocumentsRebuilt: 0,
        settingsOutcome: 'keep-current',
        replaceAll: true,
        novelsTotal: 1,
        chaptersTotal: 0,
        tasksTotal: 0,
        schedulerPoliciesTotal: 0,
        searchDocumentsTotal: 0
      },
      createdAt: stamp
    },
    mergePlanFingerprint: `sha256-plan-v1:${'5'.repeat(64)}`,
    selectedMode: 'replace',
    settingsPolicy: 'keep-current',
    temporaryRoot: `restore-session:${id}`,
    createdAt: stamp,
    lastActivityAt: stamp,
    expiresAt: '2026-07-25T17:00:00.000Z',
    absoluteExpiresAt: '2026-07-25T18:00:00.000Z',
    lockedOperationId: 'replace-operation-execute'
  };
}

function replaceContext(): BackupOperationExecutionContext {
  return {
    operationId: 'replace-operation-execute',
    transition(input) {
      return {
        id: 'replace-operation-execute',
        idempotencyKey: 'replace-execute-request',
        requestFingerprint: 'replace-execute-fingerprint',
        kind: 'restore',
        mode: 'replace',
        state: 'running',
        stage: input.stage,
        cancellable: input.cancellable,
        cancelRequestedAt: null,
        progressCurrent: input.progressCurrent,
        progressTotal: input.progressTotal,
        errorCode: null,
        errorDetails: null,
        resultArtifactId: null,
        safetyArtifactId: input.safetyArtifactId ?? null,
        result: null,
        startedAt: '2026-07-25T16:00:00.000Z',
        updatedAt: '2026-07-25T16:00:00.000Z',
        finishedAt: null,
        metadataExpiresAt: '2026-08-01T16:00:00.000Z'
      };
    },
    cancellationRequested: () => false,
    throwIfCancellationRequested: () => undefined
  };
}

type ReplaceFailurePoint =
  | 'safety-backup-create'
  | 'safety-backup-validation'
  | 'staging-copy'
  | 'staging-validation'
  | 'maintenance-stop'
  | 'old-database-rename'
  | 'new-database-rename'
  | 'reopen'
  | 'post-promote-validation'
  | 'background-restart';

async function replaceExecutionFixture(context: Parameters<typeof createBackupControlFixture>[0]) {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-replace-execution-'));
  const primaryPath = join(root, 'primary.sqlite');
  const candidateSource = join(root, 'candidate-source.sqlite');
  createDatabase(primaryPath, 'old');
  createDatabase(candidateSource, 'new');
  const primary = new SqliteDatabase(primaryPath);
  context.after(async () => {
    primary.close();
    await rm(root, { recursive: true, force: true });
  });
  const store = new SqliteBackupStore(primary, primaryPath, root);
  const files = new NodeBackupFileStore(root);
  await files.initialize();
  const control = await createBackupControlFixture(context);
  const session = replaceSession('replace-session-execute');
  control.repository.createOperation({
    id: 'replace-operation-execute',
    idempotencyKey: 'replace-execute-request',
    requestFingerprint: 'replace-execute-fingerprint',
    kind: 'restore',
    mode: 'replace',
    state: 'running',
    stage: 'queued',
    cancellable: true,
    cancelRequestedAt: null,
    progressCurrent: 0,
    progressTotal: 8,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: null,
    result: null,
    startedAt: '2026-07-25T16:00:00.000Z',
    updatedAt: '2026-07-25T16:00:00.000Z',
    finishedAt: null,
    metadataExpiresAt: '2026-08-01T16:00:00.000Z'
  });
  control.repository.createRestoreSession(session);
  await files.initializeSession(session.id);
  await files.writeInspectionFile(
    session.id,
    'database.sqlite',
    await readFileBuffer(candidateSource)
  );
  await files.writeInspectionFile(session.id, 'contributors.json', Buffer.from('{}'));
  await files.writeInspectionFile(session.id, 'settings.json', Buffer.from('{}'));
  const preparation = new RestorePreparationService(control.repository, files, {
    clock: { now: () => new Date('2026-07-25T16:00:00.000Z') },
    ids: { randomId: () => 'unused' }
  });
  const journal = new NodeReplaceJournalStore(root);
  const maintenanceTrace: string[] = [];
  let failurePoint: ReplaceFailurePoint | null = null;
  const maintenance = new BackupMaintenanceCoordinator(
    {
      begin: () => maintenanceTrace.push('begin'),
      end: () => maintenanceTrace.push('end')
    },
    [
      {
        stop() {
          maintenanceTrace.push('service.stop');
          if (failurePoint === 'maintenance-stop') throw new Error('maintenance stop failed');
        },
        start() {
          maintenanceTrace.push(`service.start:${readMarker(primaryPath)}`);
          if (failurePoint === 'background-restart') {
            throw new Error('background restart failed');
          }
        }
      }
    ]
  );
  let validationCalls = 0;
  const executorStore = new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'prepareReplacement') {
        return async (...args: Parameters<BackupStorePort['prepareReplacement']>) => {
          if (failurePoint === 'staging-copy') throw new Error('staging copy failed');
          return target.prepareReplacement(...args);
        };
      }
      if (property === 'validateDatabaseFile') {
        return (...args: Parameters<BackupStorePort['validateDatabaseFile']>) => {
          validationCalls += 1;
          if (failurePoint === 'staging-validation' && validationCalls === 1) {
            throw new Error('staging validation failed');
          }
          if (failurePoint === 'post-promote-validation' && validationCalls === 2) {
            throw new Error('post-promote validation failed');
          }
          return target.validateDatabaseFile(...args);
        };
      }
      if (property === 'movePrimaryToRollback') {
        return async (...args: Parameters<BackupStorePort['movePrimaryToRollback']>) => {
          if (failurePoint === 'old-database-rename') throw new Error('old rename failed');
          return target.movePrimaryToRollback(...args);
        };
      }
      if (property === 'promotePreparedDatabase') {
        return async (...args: Parameters<BackupStorePort['promotePreparedDatabase']>) => {
          if (failurePoint === 'new-database-rename') throw new Error('new rename failed');
          return target.promotePreparedDatabase(...args);
        };
      }
      if (property === 'openPrimaryDatabase') {
        return () => {
          if (failurePoint === 'reopen') throw new Error('reopen failed');
          return target.openPrimaryDatabase();
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    }
  }) as BackupStorePort;
  const executor = new ReplaceRestoreExecutor(
    executorStore,
    maintenance,
    {
      async execute() {
        if (failurePoint === 'safety-backup-create') {
          throw new Error('safety backup create failed');
        }
        return {
          filename: 'backup.nvt',
          contentType: 'application/vnd.novel-tool.backup',
          content: Buffer.from('validated-safety-archive'),
          encrypted: false
        };
      }
    },
    {
      create: () => Promise.reject(new Error('unused')),
      readManifest: () => Promise.reject(new Error('unused')),
      open: async () => {
        if (failurePoint === 'safety-backup-validation') {
          throw new Error('safety backup validation failed');
        }
        return {
          database: Buffer.alloc(0),
          contributors: {},
          settings: {},
          manifest: {
            format: 'novel-tool-backup',
            formatVersion: 3,
            appVersion: 'test',
            schemaVersion: 2,
            createdAt: '2026-07-25T16:00:00.000Z',
            encrypted: false,
            algorithm: 'none',
            checksumSha256: '0'.repeat(64),
            payloadSize: 0
          }
        };
      }
    },
    {
      async createFromOperation(input) {
        return {
          id: 'safety-artifact-1',
          operationId: input.operationId,
          kind: 'safety-backup',
          path: join(root, 'artifact.nvt'),
          filename: input.filename,
          sizeBytes: 24,
          sha256: '6'.repeat(64),
          encrypted: false,
          createdAt: '2026-07-25T16:00:00.000Z',
          expiresAt: '2026-07-26T16:00:00.000Z',
          downloadTokenHash: null,
          downloadTokenExpiresAt: null,
          downloadTokenConsumedAt: null
        };
      }
    },
    files,
    journal,
    control.repository,
    preparation,
    { error: () => undefined }
  );
  return {
    root,
    primaryPath,
    store,
    control,
    journal,
    maintenanceTrace,
    executor,
    failAt(point: ReplaceFailurePoint) {
      failurePoint = point;
    }
  };
}

test('Replace creates a safety artifact before maintenance and promotes the validated database', async (context) => {
  const fixture = await replaceExecutionFixture(context);
  const output = await fixture.executor.execute(replaceContext(), {
    sessionId: 'replace-session-execute',
    inspectionToken: 'inspection',
    planFingerprint: `sha256-plan-v1:${'5'.repeat(64)}`,
    currentSettings: { theme: 'dark' }
  });

  assert.equal(readMarker(fixture.primaryPath), 'new');
  assert.equal(output.safetyArtifactId, 'safety-artifact-1');
  assert.equal(output.result?.expiresAt, '2026-07-26T16:00:00.000Z');
  assert.deepEqual(fixture.maintenanceTrace, ['begin', 'service.stop', 'service.start:new', 'end']);
  assert.equal(
    fixture.control.repository.findRestoreSession('replace-session-execute')?.state,
    'locked'
  );
  assert.notEqual(await fixture.journal.read(), null);

  await output.onSucceeded?.();
  assert.equal(
    fixture.control.repository.findRestoreSession('replace-session-execute')?.state,
    'consumed'
  );
  assert.equal(await fixture.journal.read(), null);
});

test('promotion failure restores rollback before background services restart', async (context) => {
  const fixture = await replaceExecutionFixture(context);
  fixture.failAt('new-database-rename');

  await assert.rejects(
    () =>
      fixture.executor.execute(replaceContext(), {
        sessionId: 'replace-session-execute',
        inspectionToken: 'inspection',
        planFingerprint: `sha256-plan-v1:${'5'.repeat(64)}`,
        currentSettings: { theme: 'dark' }
      }),
    /new rename failed/
  );

  assert.equal(readMarker(fixture.primaryPath), 'old');
  assert.deepEqual(fixture.maintenanceTrace, ['begin', 'service.stop', 'service.start:old', 'end']);
  assert.equal(await fixture.journal.read(), null);
  assert.equal(
    fixture.control.repository.findRestoreSession('replace-session-execute')?.state,
    'invalid'
  );
});

test('safety Backup failure never enters maintenance and leaves Replace ready for retry', async (context) => {
  const fixture = await replaceExecutionFixture(context);
  fixture.failAt('safety-backup-create');
  await assert.rejects(
    () =>
      fixture.executor.execute(replaceContext(), {
        sessionId: 'replace-session-execute',
        inspectionToken: 'inspection',
        planFingerprint: `sha256-plan-v1:${'5'.repeat(64)}`,
        currentSettings: { theme: 'dark' }
      }),
    /safety backup create failed/
  );
  assert.equal(readMarker(fixture.primaryPath), 'old');
  assert.deepEqual(fixture.maintenanceTrace, []);
  assert.equal(
    fixture.control.repository.findRestoreSession('replace-session-execute')?.state,
    'ready'
  );
});

test('Replace failure injection preserves a recoverable database at every promotion boundary', async (context) => {
  const cases: Array<{
    point: ReplaceFailurePoint;
    message: RegExp;
    expectedMarker: 'old' | 'new';
    expectedSession: 'ready' | 'invalid';
    journalRemains: boolean;
    maintenanceStarted: boolean;
  }> = [
    {
      point: 'safety-backup-validation',
      message: /safety backup validation failed/,
      expectedMarker: 'old',
      expectedSession: 'ready',
      journalRemains: false,
      maintenanceStarted: false
    },
    {
      point: 'staging-copy',
      message: /staging copy failed/,
      expectedMarker: 'old',
      expectedSession: 'ready',
      journalRemains: false,
      maintenanceStarted: false
    },
    {
      point: 'staging-validation',
      message: /staging validation failed/,
      expectedMarker: 'old',
      expectedSession: 'ready',
      journalRemains: false,
      maintenanceStarted: false
    },
    {
      point: 'maintenance-stop',
      message: /maintenance stop failed/,
      expectedMarker: 'old',
      expectedSession: 'invalid',
      journalRemains: false,
      maintenanceStarted: true
    },
    {
      point: 'old-database-rename',
      message: /old rename failed/,
      expectedMarker: 'old',
      expectedSession: 'invalid',
      journalRemains: false,
      maintenanceStarted: true
    },
    {
      point: 'reopen',
      message: /reopen failed/,
      expectedMarker: 'old',
      expectedSession: 'invalid',
      journalRemains: false,
      maintenanceStarted: true
    },
    {
      point: 'post-promote-validation',
      message: /post-promote validation failed/,
      expectedMarker: 'old',
      expectedSession: 'invalid',
      journalRemains: false,
      maintenanceStarted: true
    },
    {
      point: 'background-restart',
      message: /restart failed/,
      expectedMarker: 'new',
      expectedSession: 'invalid',
      journalRemains: true,
      maintenanceStarted: true
    }
  ];

  for (const item of cases) {
    await context.test(item.point, async (child) => {
      const fixture = await replaceExecutionFixture(child);
      fixture.failAt(item.point);
      await assert.rejects(
        () =>
          fixture.executor.execute(replaceContext(), {
            sessionId: 'replace-session-execute',
            inspectionToken: 'inspection',
            planFingerprint: `sha256-plan-v1:${'5'.repeat(64)}`,
            currentSettings: { theme: 'dark' }
          }),
        item.message
      );
      assert.equal(readMarker(fixture.primaryPath), item.expectedMarker);
      assert.equal(
        fixture.control.repository.findRestoreSession('replace-session-execute')?.state,
        item.expectedSession
      );
      assert.equal((await fixture.journal.read()) !== null, item.journalRemains);
      assert.equal(fixture.maintenanceTrace.includes('begin'), item.maintenanceStarted);
    });
  }
});
