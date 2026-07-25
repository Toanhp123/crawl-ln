import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BackupOperationError } from '../../apps/api/src/modules/backup/application/errors/backup.error.ts';
import { MergeRestoreExecutor } from '../../apps/api/src/modules/backup/application/services/merge-restore.executor.ts';
import { BackupOperationCoordinator } from '../../apps/api/src/modules/backup/application/services/backup-operation-coordinator.ts';
import { BackupOperationService } from '../../apps/api/src/modules/backup/application/services/backup-operation.service.ts';
import {
  RestoreExecutionService,
  REPLACE_CONFIRMATION_PHRASE
} from '../../apps/api/src/modules/backup/application/services/restore-execution.service.ts';
import { createOpaqueToken } from '../../apps/api/src/modules/backup/domain/restore-session.models.ts';
import { RestorePreparationService } from '../../apps/api/src/modules/backup/application/services/restore-preparation.service.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import type { BackupOperationExecutionContext } from '../../apps/api/src/modules/backup/application/services/backup-operation-coordinator.ts';
import type {
  BackupRestorePlan,
  RestoreSessionRecord
} from '../../apps/api/src/modules/backup/domain/restore-session.models.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';

const now = new Date('2026-07-25T15:00:00.000Z');
const planFingerprint = `sha256-plan-v1:${'a'.repeat(64)}`;

const contributorModules = [
  ['library', 'merge_items'],
  ['source-reader', 'source_items'],
  ['ingestion', 'ingestion_items'],
  ['scheduler', 'scheduler_items'],
  ['search', 'search_items']
] as const;

type ContributorModule = (typeof contributorModules)[number][0];

function plan(targetFingerprint = 'target:0'): BackupRestorePlan {
  return {
    mode: 'merge',
    settingsPolicy: 'keep-current',
    archiveChecksum: 'b'.repeat(64),
    targetFingerprint,
    contributorImpact: { library: { rowsAdded: 2 } },
    impact: {
      novelsNew: 2,
      novelsExisting: 0,
      chaptersAdded: 0,
      chaptersSkipped: 0,
      sourceRemaps: 0,
      tasksRestored: 0,
      schedulerPoliciesRestored: 0,
      searchDocumentsRebuilt: 0,
      settingsOutcome: 'keep-current'
    },
    createdAt: now.toISOString()
  };
}

function session(id: string, root: string): RestoreSessionRecord {
  return {
    id,
    sessionTokenHash: '1'.repeat(64),
    inspectionTokenHash: '2'.repeat(64),
    state: 'locked',
    stage: 'locked',
    originalFilename: 'fixture.nvt',
    expectedBytes: 100,
    receivedBytes: 100,
    fileFingerprint: `sha256-partial-v1:${'3'.repeat(64)}`,
    archiveChecksum: 'b'.repeat(64),
    encrypted: false,
    passwordFailures: 0,
    inventory: {
      createdAt: now.toISOString(),
      appVersion: 'test',
      schemaVersion: 2,
      archiveSizeBytes: 100,
      encrypted: false,
      library: { novels: 2, analyzedNovels: 2, chapters: 0, fetchedChapters: 0 },
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
    mergePlan: plan(),
    mergePlanFingerprint: planFingerprint,
    selectedMode: 'merge',
    settingsPolicy: 'keep-current',
    temporaryRoot: root,
    createdAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + 120_000).toISOString(),
    lockedOperationId: 'restore-operation-1'
  };
}

function executionContext(options: { cancelled?: boolean } = {}) {
  const transitions: Array<{ stage: string; cancellable: boolean }> = [];
  let cancelled = options.cancelled ?? false;
  const context: BackupOperationExecutionContext = {
    operationId: 'restore-operation-1',
    transition(input) {
      transitions.push({ stage: input.stage, cancellable: input.cancellable });
      return {
        id: 'restore-operation-1',
        idempotencyKey: 'restore-request-1',
        requestFingerprint: 'request-fingerprint',
        kind: 'restore',
        mode: 'merge',
        state: 'running',
        stage: input.stage,
        cancellable: input.cancellable,
        cancelRequestedAt: cancelled ? now.toISOString() : null,
        progressCurrent: input.progressCurrent,
        progressTotal: input.progressTotal,
        errorCode: null,
        errorDetails: null,
        resultArtifactId: null,
        safetyArtifactId: null,
        result: null,
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        finishedAt: null,
        metadataExpiresAt: new Date(now.getTime() + 60_000).toISOString()
      };
    },
    cancellationRequested: () => cancelled,
    throwIfCancellationRequested() {
      if (cancelled) {
        throw new BackupOperationError('BACKUP_OPERATION_CANCELLED', 409, 'cancelled', false);
      }
    }
  };
  return { context, transitions, cancel: () => (cancelled = true) };
}

async function fixture(context: Parameters<typeof createBackupControlFixture>[0]) {
  const control = await createBackupControlFixture(context);
  const storageRoot = await mkdtemp(join(tmpdir(), 'novel-tool-merge-execution-'));
  const files = new NodeBackupFileStore(storageRoot);
  await files.initialize();
  context.after(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });
  const database = new SqliteDatabase(':memory:');
  for (const [, table] of contributorModules) {
    database.connection.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY);`);
  }
  context.after(() => database.close());
  const record = session('restore-session-1', 'restore-session:restore-session-1');
  control.repository.createOperation({
    id: 'restore-operation-1',
    idempotencyKey: 'restore-request-1',
    requestFingerprint: 'request-fingerprint',
    kind: 'restore',
    mode: 'merge',
    state: 'running',
    stage: 'preparing',
    cancellable: true,
    cancelRequestedAt: null,
    progressCurrent: 0,
    progressTotal: 9,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: null,
    result: null,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    finishedAt: null,
    metadataExpiresAt: new Date(now.getTime() + 60_000).toISOString()
  });
  control.repository.createRestoreSession(record);
  await files.initializeSession(record.id);
  await files.writeInspectionFile(
    record.id,
    'contributors.json',
    Buffer.from(
      JSON.stringify({
        library: { ids: ['one', 'two'] },
        'source-reader': { ids: ['source-one'] },
        ingestion: { ids: ['task-one'] },
        scheduler: { ids: ['policy-one'] },
        search: { ids: ['document-one'] }
      })
    )
  );
  await files.writeInspectionFile(record.id, 'settings.json', Buffer.from('{}'));

  const preparation = new RestorePreparationService(control.repository, files, {
    clock: { now: () => now },
    ids: { randomId: () => 'unused' }
  });
  let failImport: ContributorModule | null = null;
  const contributors = {
    fingerprintTables: () => contributorModules.map(([, table]) => table),
    async importAll(
      data: unknown,
      input: { importId: string; onBeforeContributor?(module: string): void }
    ) {
      const restored: Record<string, { rowsAdded: number }> = {};
      const records = data as Record<string, { ids: string[] }>;
      for (const [module, table] of contributorModules) {
        input.onBeforeContributor?.(module);
        const ids = records[module].ids;
        for (const id of ids) {
          database.connection.prepare(`INSERT INTO ${table}(id) VALUES(?)`).run(id);
        }
        if (failImport === module) {
          throw new Error(`injected import failure:${module}`);
        }
        restored[module] = { rowsAdded: ids.length };
      }
      return restored;
    }
  };
  const planner = {
    async createMergePlanInCurrentTransaction() {
      const count = Number(
        (
          database.connection.prepare('SELECT COUNT(*) AS count FROM merge_items').get() as {
            count: number;
          }
        ).count
      );
      return {
        plan: plan(`target:${count}`),
        fingerprint: count === 0 ? planFingerprint : `sha256-plan-v1:${'c'.repeat(64)}`
      };
    }
  };
  const published: string[] = [];
  const executor = new MergeRestoreExecutor(
    database,
    planner,
    contributors,
    control.repository,
    preparation,
    files,
    {
      publish: (event) => {
        published.push(event.resources.join(','));
        return { ...event, id: 'event', occurredAt: now.toISOString() };
      }
    }
  );

  return {
    control,
    files,
    database,
    preparation,
    executor,
    published,
    setFailImport(value: ContributorModule | null) {
      failImport = value;
    }
  };
}

test('matching Merge plan applies in one transaction and consumes the session', async (context) => {
  const value = await fixture(context);
  const execution = executionContext();
  const output = await value.executor.execute(execution.context, {
    sessionId: 'restore-session-1',
    inspectionToken: 'inspection-secret',
    planFingerprint,
    currentSettings: {}
  });

  for (const [module, table] of contributorModules) {
    const expected = module === 'library' ? 2 : 1;
    assert.equal(
      (
        value.database.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count,
      expected
    );
  }
  assert.equal(value.control.repository.findRestoreSession('restore-session-1')?.state, 'locked');
  await output.onSucceeded?.();
  assert.equal(value.control.repository.findRestoreSession('restore-session-1')?.state, 'consumed');
  assert.equal(output.result?.restoreMode, 'merge');
  assert.deepEqual(
    execution.transitions.map((item) => item.stage),
    [
      'preparing',
      'verifying-plan',
      'applying-library',
      'applying-source-reader',
      'applying-ingestion',
      'applying-scheduler',
      'applying-search',
      'applying-settings',
      'finalizing'
    ]
  );
  assert.deepEqual(value.published, []);
  value.executor.afterSuccess?.(output);
  assert.deepEqual(value.published, ['all']);
});

test('stale Merge plan rolls back and unlocks the session for replanning', async (context) => {
  const value = await fixture(context);
  value.database.connection.prepare('INSERT INTO merge_items(id) VALUES(?)').run('target-change');
  const execution = executionContext();

  await assert.rejects(
    () =>
      value.executor.execute(execution.context, {
        sessionId: 'restore-session-1',
        inspectionToken: 'inspection-secret',
        planFingerprint,
        currentSettings: {}
      }),
    (error: unknown) => error instanceof BackupOperationError && error.code === 'RESTORE_PLAN_STALE'
  );
  assert.equal(
    (
      value.database.connection.prepare('SELECT COUNT(*) AS count FROM merge_items').get() as {
        count: number;
      }
    ).count,
    1
  );
  const session = value.control.repository.findRestoreSession('restore-session-1');
  assert.equal(session?.state, 'ready');
  assert.equal(session?.mergePlanFingerprint, null);
  assert.equal(session?.lockedOperationId, null);
});

test('contributor failure rolls back all writes and leaves the ready session retryable', async (context) => {
  const value = await fixture(context);
  value.setFailImport('library');
  const execution = executionContext();

  await assert.rejects(
    () =>
      value.executor.execute(execution.context, {
        sessionId: 'restore-session-1',
        inspectionToken: 'inspection-secret',
        planFingerprint,
        currentSettings: {}
      }),
    /injected import failure:library/
  );
  assert.equal(
    (
      value.database.connection.prepare('SELECT COUNT(*) AS count FROM merge_items').get() as {
        count: number;
      }
    ).count,
    0
  );
  assert.equal(value.control.repository.findRestoreSession('restore-session-1')?.state, 'ready');
});

test('failure in every Merge contributor rolls every module table back', async (context) => {
  for (const [failedModule] of contributorModules) {
    await context.test(failedModule, async (child) => {
      const value = await fixture(child);
      value.setFailImport(failedModule);
      const execution = executionContext();

      await assert.rejects(
        () =>
          value.executor.execute(execution.context, {
            sessionId: 'restore-session-1',
            inspectionToken: 'inspection-secret',
            planFingerprint,
            currentSettings: {}
          }),
        new RegExp(`injected import failure:${failedModule}`)
      );
      for (const [, table] of contributorModules) {
        assert.equal(
          (
            value.database.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
              count: number;
            }
          ).count,
          0
        );
      }
      assert.equal(
        value.control.repository.findRestoreSession('restore-session-1')?.state,
        'ready'
      );
    });
  }
});

test('Restore start locks the session atomically, validates secrets, and preserves idempotency', async (context) => {
  const control = await createBackupControlFixture(context);
  const storageRoot = await mkdtemp(join(tmpdir(), 'novel-tool-restore-start-'));
  context.after(() => rm(storageRoot, { recursive: true, force: true }));
  const files = new NodeBackupFileStore(storageRoot);
  await files.initialize();
  const sessionToken = createOpaqueToken();
  const inspectionToken = createOpaqueToken();
  const ready = {
    ...session('restore-start-session', 'restore-session:restore-start-session'),
    sessionTokenHash: sessionToken.hash,
    inspectionTokenHash: inspectionToken.hash,
    state: 'ready' as const,
    stage: 'ready',
    lockedOperationId: null
  };
  control.repository.createRestoreSession(ready);
  await files.initializeSession(ready.id);

  const preparation = new RestorePreparationService(control.repository, files, {
    clock: { now: () => now },
    ids: { randomId: () => 'unused' }
  });
  const operations = new BackupOperationService(control.repository, {
    clock: { now: () => now },
    ids: { randomId: () => 'restore-start-operation' }
  });
  const coordinator = new BackupOperationCoordinator(operations, { error: () => undefined });
  const executor = {
    async execute() {
      return {
        result: { restoreMode: 'merge' },
        onSucceeded: async () => {
          await preparation.consumeExecution(ready.id);
        }
      };
    }
  };
  const service = new RestoreExecutionService(
    control.repository,
    operations,
    coordinator,
    preparation,
    executor,
    executor,
    { clock: { now: () => now }, ids: { randomId: () => 'restore-start-operation' } }
  );
  const request = {
    sessionId: ready.id,
    sessionToken: sessionToken.plaintext,
    inspectionToken: inspectionToken.plaintext,
    planFingerprint,
    idempotencyKey: 'restore-start-key',
    confirmation: { accepted: true },
    currentSettings: { theme: 'dark' }
  };

  const started = service.start(request);
  assert.equal(started.state, 'queued');
  assert.equal(started.progressTotal, MergeRestoreExecutor.progressTotal());
  assert.equal(control.repository.findRestoreSession(ready.id)?.state, 'locked');
  assert.equal(control.repository.findRestoreSession(ready.id)?.lockedOperationId, started.id);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (operations.read(started.id).state === 'succeeded') break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(operations.read(started.id).state, 'succeeded');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (control.repository.findRestoreSession(ready.id)?.state === 'consumed') break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(control.repository.findRestoreSession(ready.id)?.state, 'consumed');
  assert.equal(service.start(request).id, started.id);
  assert.throws(
    () => service.start({ ...request, currentSettings: { theme: 'light' } }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'IDEMPOTENCY_KEY_REUSED'
  );
});

test('Restore confirmation is exact and rejected before operation creation', async (context) => {
  const control = await createBackupControlFixture(context);
  const storageRoot = await mkdtemp(join(tmpdir(), 'novel-tool-restore-confirmation-'));
  context.after(() => rm(storageRoot, { recursive: true, force: true }));
  const files = new NodeBackupFileStore(storageRoot);
  await files.initialize();
  const sessionToken = createOpaqueToken();
  const inspectionToken = createOpaqueToken();
  const ready = {
    ...session('restore-confirm-session', 'restore-session:restore-confirm-session'),
    sessionTokenHash: sessionToken.hash,
    inspectionTokenHash: inspectionToken.hash,
    state: 'ready' as const,
    stage: 'ready',
    selectedMode: 'replace' as const,
    mergePlan: { ...plan(), mode: 'replace' as const },
    lockedOperationId: null
  };
  control.repository.createRestoreSession(ready);
  const preparation = new RestorePreparationService(control.repository, files, {
    clock: { now: () => now },
    ids: { randomId: () => 'unused' }
  });
  const operations = new BackupOperationService(control.repository, {
    clock: { now: () => now },
    ids: { randomId: () => 'unused' }
  });
  const coordinator = new BackupOperationCoordinator(operations, { error: () => undefined });
  const executor = {
    async execute() {
      return { result: { restoreMode: 'replace' } };
    }
  };
  const service = new RestoreExecutionService(
    control.repository,
    operations,
    coordinator,
    preparation,
    executor,
    executor,
    { clock: { now: () => now }, ids: { randomId: () => 'unused' } }
  );
  const base = {
    sessionId: ready.id,
    sessionToken: sessionToken.plaintext,
    inspectionToken: inspectionToken.plaintext,
    planFingerprint,
    idempotencyKey: 'replace-confirm-key',
    currentSettings: {}
  };

  for (const typedPhrase of [
    '',
    'THAY THE DU LIEU',
    'thay thế dữ liệu',
    `${REPLACE_CONFIRMATION_PHRASE} `
  ]) {
    assert.throws(
      () => service.start({ ...base, confirmation: { accepted: true, typedPhrase } }),
      (error: unknown) =>
        error instanceof BackupOperationError && error.code === 'RESTORE_CONFIRMATION_INVALID'
    );
  }
  assert.equal(control.repository.findActiveOperation(), null);
  assert.equal(control.repository.findRestoreSession(ready.id)?.state, 'ready');
});

test('cancellation before the Merge transaction unlocks the ready session without writes', async (context) => {
  const value = await fixture(context);
  const execution = executionContext({ cancelled: true });

  await assert.rejects(
    () =>
      value.executor.execute(execution.context, {
        sessionId: 'restore-session-1',
        inspectionToken: 'inspection-secret',
        planFingerprint,
        currentSettings: {}
      }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'BACKUP_OPERATION_CANCELLED'
  );

  assert.equal(
    (
      value.database.connection.prepare('SELECT COUNT(*) AS count FROM merge_items').get() as {
        count: number;
      }
    ).count,
    0
  );
  assert.equal(value.control.repository.findRestoreSession('restore-session-1')?.state, 'ready');
});
