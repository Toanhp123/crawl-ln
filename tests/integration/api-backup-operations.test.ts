import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { setTimeout as waitForTimer } from 'node:timers/promises';
import test from 'node:test';
import { join } from 'node:path';
import { BackupArtifactService } from '../../apps/api/src/modules/backup/application/services/backup-artifact.service.ts';
import { CreateBackupOperationExecutor } from '../../apps/api/src/modules/backup/application/services/create-backup-operation.executor.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import { JsZipBackupArchive } from '../../apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts';
import { BackupOperationError } from '../../apps/api/src/modules/backup/application/errors/backup.error.ts';
import {
  BackupOperationCoordinator,
  type BackupOperationExecutor
} from '../../apps/api/src/modules/backup/application/services/backup-operation-coordinator.ts';
import { BackupOperationService } from '../../apps/api/src/modules/backup/application/services/backup-operation.service.ts';
import type {
  BackupOperationRecord,
  BackupOperationState,
  CreateBackupOperationRecord
} from '../../apps/api/src/modules/backup/domain/backup-operation.models.ts';
import type { BackupControlRepository } from '../../apps/api/src/modules/backup/application/ports/backup-control.repository.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function startInput(overrides: Partial<Parameters<BackupOperationCoordinator['start']>[0]> = {}) {
  return {
    idempotencyKey: 'request-1',
    requestFingerprint: 'fingerprint-1',
    kind: 'backup' as const,
    initialStage: 'queued',
    progressTotal: 2,
    ...overrides
  };
}

function persistedOperation(
  id: string,
  state: 'queued' | 'running' = 'queued',
  overrides: Partial<CreateBackupOperationRecord> = {}
): CreateBackupOperationRecord {
  return {
    id,
    idempotencyKey: `request-${id}`,
    requestFingerprint: `fingerprint-${id}`,
    kind: 'backup',
    mode: null,
    state,
    stage: state,
    cancellable: true,
    cancelRequestedAt: null,
    progressCurrent: 0,
    progressTotal: 2,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: null,
    result: null,
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    finishedAt: null,
    metadataExpiresAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

function createHarness(repository: BackupControlRepository) {
  let id = 0;
  let now = new Date('2026-07-25T00:00:00.000Z');
  const errors: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  const service = new BackupOperationService(repository, {
    clock: { now: () => new Date(now) },
    ids: { randomId: () => `operation-${++id}` }
  });
  const coordinator = new BackupOperationCoordinator(service, {
    error(message, metadata) {
      errors.push({ message, metadata });
    }
  });
  return {
    service,
    coordinator,
    errors,
    setNow(value: string) {
      now = new Date(value);
    }
  };
}

async function waitForState(
  service: BackupOperationService,
  operationId: string,
  state: BackupOperationState
): Promise<BackupOperationRecord> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const operation = service.read(operationId);
    if (operation.state === state) return operation;
    await waitForTimer(5);
  }
  assert.fail(`Operation ${operationId} did not reach ${state}`);
}

test('operations enforce single-flight and replay matching idempotent starts', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const execution = deferred<{ result: Record<string, unknown> }>();
  let executions = 0;
  const executor: BackupOperationExecutor<{ password: string }> = {
    async execute() {
      executions += 1;
      return execution.promise;
    }
  };

  const first = harness.coordinator.start(startInput(), executor, { password: 'not-persisted' });
  assert.equal(first.state, 'queued');

  assert.throws(
    () =>
      harness.coordinator.start(
        startInput({ idempotencyKey: 'request-2', requestFingerprint: 'fingerprint-2' }),
        executor,
        { password: 'second-secret' }
      ),
    (error: unknown) =>
      error instanceof BackupOperationError &&
      error.code === 'BACKUP_OPERATION_ACTIVE' &&
      error.status === 409 &&
      (error.details?.operation as { id?: string } | undefined)?.id === first.id
  );

  const replay = harness.coordinator.start(startInput(), executor, {
    password: 'ignored-replay-secret'
  });
  assert.equal(replay.id, first.id);
  assert.throws(
    () =>
      harness.coordinator.start(
        startInput({ requestFingerprint: 'different-fingerprint' }),
        executor,
        { password: 'different' }
      ),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'IDEMPOTENCY_KEY_REUSED'
  );

  await waitForState(harness.service, first.id, 'running');
  assert.equal(executions, 1);
  execution.resolve({ result: { completed: true } });
  const succeeded = await waitForState(harness.service, first.id, 'succeeded');
  assert.deepEqual(succeeded.result, { completed: true });

  const second = harness.coordinator.start(
    startInput({ idempotencyKey: 'request-2', requestFingerprint: 'fingerprint-2' }),
    { execute: async () => ({ result: { second: true } }) },
    null
  );
  assert.notEqual(second.id, first.id);
  await waitForState(harness.service, second.id, 'succeeded');
});

test('service marks persisted active work interrupted before accepting a new start', async (context) => {
  const fixture = await createBackupControlFixture(context);
  fixture.repository.createOperation(persistedOperation('stale-running', 'running'));
  let id = 0;
  const service = new BackupOperationService(fixture.repository, {
    clock: { now: () => new Date('2026-07-25T06:00:00.000Z') },
    ids: { randomId: () => `new-operation-${++id}` }
  });
  service.recoverInterruptedOperations();

  const interrupted = service.read('stale-running');
  assert.equal(interrupted.state, 'interrupted');
  assert.equal(interrupted.stage, 'interrupted');
  assert.equal(interrupted.cancellable, false);
  assert.equal(interrupted.errorCode, 'BACKUP_OPERATION_INTERRUPTED');
  assert.equal(interrupted.finishedAt, '2026-07-25T06:00:00.000Z');
  assert.equal(interrupted.metadataExpiresAt, '2026-08-01T06:00:00.000Z');

  const started = service.start(startInput()).operation;
  assert.equal(started.state, 'queued');
});

test('cancellation is recorded and cooperatively observed by the executor', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const entered = deferred<void>();
  const release = deferred<void>();
  const operation = harness.coordinator.start(
    startInput(),
    {
      async execute(executionContext) {
        entered.resolve();
        await release.promise;
        executionContext.throwIfCancellationRequested();
        return {};
      }
    },
    { password: 'temporary' }
  );

  await entered.promise;
  harness.setNow('2026-07-25T00:05:00.000Z');
  const requested = harness.service.requestCancel(operation.id);
  assert.equal(requested.cancelRequestedAt, '2026-07-25T00:05:00.000Z');
  release.resolve();

  const cancelled = await waitForState(harness.service, operation.id, 'cancelled');
  assert.equal(cancelled.stage, 'cancelled');
  assert.equal(cancelled.cancellable, false);
  assert.equal(cancelled.finishedAt, '2026-07-25T00:05:00.000Z');
});

test('cancellation is rejected after the executor crosses its boundary', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const crossedBoundary = deferred<void>();
  const release = deferred<void>();
  const operation = harness.coordinator.start(
    startInput(),
    {
      async execute(executionContext) {
        executionContext.transition({
          stage: 'promoting',
          progressCurrent: 1,
          progressTotal: 2,
          cancellable: false
        });
        crossedBoundary.resolve();
        await release.promise;
        return {};
      }
    },
    null
  );

  await crossedBoundary.promise;
  assert.throws(
    () => harness.service.requestCancel(operation.id),
    (error: unknown) =>
      error instanceof BackupOperationError &&
      error.code === 'BACKUP_OPERATION_NOT_CANCELLABLE' &&
      error.status === 409
  );
  release.resolve();
  await waitForState(harness.service, operation.id, 'succeeded');
});

test('executor API contains execution context and secret but no request object', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  let argumentCount = 0;
  let observedSecret: unknown;
  const operation = harness.coordinator.start(
    startInput(),
    {
      execute(...arguments_: [unknown, unknown]) {
        argumentCount = arguments_.length;
        observedSecret = arguments_[1];
        return Promise.resolve({});
      }
    },
    { exact: 'secret' }
  );

  await waitForState(harness.service, operation.id, 'succeeded');
  assert.equal(argumentCount, 2);
  assert.deepEqual(observedSecret, { exact: 'secret' });
});

test('invalid lifecycle transition leaves the stored operation unchanged', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const { operation } = harness.service.start(startInput());
  const before = harness.service.read(operation.id);

  assert.throws(
    () =>
      harness.service.transition(operation.id, {
        state: 'succeeded',
        stage: 'succeeded',
        cancellable: false
      }),
    /Invalid backup operation transition queued -> succeeded/
  );
  assert.deepEqual(harness.service.read(operation.id), before);
});

test('successful terminal transition clears stale failure and result metadata', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const service = new BackupOperationService(fixture.repository, {
    clock: { now: () => new Date('2026-07-25T02:00:00.000Z') },
    ids: { randomId: () => 'unused' }
  });
  fixture.repository.createOperation(
    persistedOperation('stale-metadata', 'running', {
      errorCode: 'STALE_ERROR',
      errorDetails: { stale: true },
      resultArtifactId: 'stale-result',
      safetyArtifactId: 'stale-safety',
      result: { stale: true }
    })
  );

  const succeeded = service.succeed('stale-metadata', {});
  assert.equal(succeeded.errorCode, null);
  assert.equal(succeeded.errorDetails, null);
  assert.equal(succeeded.resultArtifactId, null);
  assert.equal(succeeded.safetyArtifactId, null);
  assert.equal(succeeded.result, null);
});

test('coordinator stores filtered known failures and redacts unknown failures', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const known = harness.coordinator.start(
    startInput(),
    {
      execute: async () => {
        throw new BackupOperationError('BACKUP_ARTIFACT_EXPIRED', 410, 'Artifact expired', false, {
          artifactId: 'artifact-1',
          password: 'must-not-persist',
          downloadToken: 'must-not-persist-either'
        });
      }
    },
    null
  );
  const knownFailure = await waitForState(harness.service, known.id, 'failed');
  assert.equal(knownFailure.errorCode, 'BACKUP_ARTIFACT_EXPIRED');
  assert.deepEqual(knownFailure.errorDetails, {
    retryable: false,
    artifactId: 'artifact-1'
  });

  const unknown = harness.coordinator.start(
    startInput({ idempotencyKey: 'request-2', requestFingerprint: 'fingerprint-2' }),
    {
      execute: async () => {
        throw new Error('password=must-never-be-persisted');
      }
    },
    null
  );
  const unknownFailure = await waitForState(harness.service, unknown.id, 'failed');
  assert.equal(unknownFailure.errorCode, 'INTERNAL_ERROR');
  assert.equal(unknownFailure.errorDetails, null);
});

test('encrypted backup operation persists ordered durable stages and artifact result', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const stages = ['queued'];
  const originalUpdate = fixture.repository.updateOperation.bind(fixture.repository);
  fixture.repository.updateOperation = (id, patch) => {
    const updated = originalUpdate(id, patch);
    if (stages.at(-1) !== updated.stage) stages.push(updated.stage);
    return updated;
  };
  const files = new NodeBackupFileStore(join(fixture.root, 'storage'));
  await files.initialize();
  let artifactId = 0;
  const artifacts = new BackupArtifactService(fixture.repository, files, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') },
    ids: { randomId: () => `artifact-${++artifactId}` }
  });
  const command = {
    async execute(
      input: { password?: string; settings?: Record<string, unknown> },
      hooks?: {
        onStage?(stage: 'collecting' | 'archiving' | 'encrypting'): void;
        throwIfCancelled?(): void;
      }
    ) {
      assert.equal(input.password, ' exact secret ');
      hooks?.onStage?.('collecting');
      hooks?.throwIfCancelled?.();
      hooks?.onStage?.('archiving');
      hooks?.throwIfCancelled?.();
      hooks?.onStage?.('encrypting');
      return {
        filename: 'encrypted.nvt',
        contentType: 'application/vnd.novel-tool.backup' as const,
        content: Buffer.from('encrypted-archive'),
        encrypted: true
      };
    }
  };
  const executor = new CreateBackupOperationExecutor(command, artifacts, files);
  const operation = harness.coordinator.start(
    startInput({ progressTotal: CreateBackupOperationExecutor.progressTotal(true) }),
    executor,
    { password: ' exact secret ', settings: { theme: 'dark' } }
  );

  const succeeded = await waitForState(harness.service, operation.id, 'succeeded');
  assert.deepEqual(stages, [
    'queued',
    'collecting',
    'archiving',
    'encrypting',
    'finalizing',
    'succeeded'
  ]);
  assert.equal(succeeded.progressCurrent, 4);
  assert.equal(succeeded.progressTotal, 4);
  assert.equal(succeeded.resultArtifactId, 'artifact-1');
  assert.deepEqual(succeeded.result, {
    filename: 'encrypted.nvt',
    sizeBytes: Buffer.byteLength('encrypted-archive'),
    encrypted: true,
    expiresAt: '2026-07-26T00:00:00.000Z'
  });
});

test('unencrypted backup operation omits encryption and uses actual stage count', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const stages = ['queued'];
  const originalUpdate = fixture.repository.updateOperation.bind(fixture.repository);
  fixture.repository.updateOperation = (id, patch) => {
    const updated = originalUpdate(id, patch);
    if (stages.at(-1) !== updated.stage) stages.push(updated.stage);
    return updated;
  };
  const files = new NodeBackupFileStore(join(fixture.root, 'storage'));
  await files.initialize();
  const artifacts = new BackupArtifactService(fixture.repository, files, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') },
    ids: { randomId: () => 'artifact-unencrypted' }
  });
  const executor = new CreateBackupOperationExecutor(
    {
      async execute(_input, hooks) {
        hooks?.onStage?.('collecting');
        hooks?.onStage?.('archiving');
        return {
          filename: 'plain.nvt',
          contentType: 'application/vnd.novel-tool.backup' as const,
          content: Buffer.from('plain-archive'),
          encrypted: false
        };
      }
    },
    artifacts,
    files
  );
  const operation = harness.coordinator.start(
    startInput({ progressTotal: CreateBackupOperationExecutor.progressTotal(false) }),
    executor,
    { settings: {} }
  );

  const succeeded = await waitForState(harness.service, operation.id, 'succeeded');
  assert.deepEqual(stages, ['queued', 'collecting', 'archiving', 'finalizing', 'succeeded']);
  assert.equal(succeeded.progressCurrent, 3);
  assert.equal(succeeded.progressTotal, 3);
});

test('backup executor observes cancellation at every cooperative boundary and leaves no artifact', async (context) => {
  for (const point of [
    'before-contributor-export',
    'during-archiving',
    'before-encryption',
    'after-archive'
  ] as const) {
    await context.test(point, async (subtest) => {
      const fixture = await createBackupControlFixture(subtest);
      const harness = createHarness(fixture.repository);
      const files = new NodeBackupFileStore(join(fixture.root, `storage-${point}`));
      await files.initialize();
      const artifacts = new BackupArtifactService(fixture.repository, files, {
        clock: { now: () => new Date('2026-07-25T00:00:00.000Z') },
        ids: { randomId: () => `artifact-${point}` }
      });
      let operationId = '';
      const requestCancellation = () => harness.service.requestCancel(operationId);
      const command = {
        async execute(
          _input: { password?: string; settings?: Record<string, unknown> },
          hooks?: {
            onStage?(stage: 'collecting' | 'archiving' | 'encrypting'): void;
            throwIfCancelled?(): void;
          }
        ) {
          hooks?.onStage?.('collecting');
          if (point === 'before-contributor-export') {
            requestCancellation();
            hooks?.throwIfCancelled?.();
          }
          hooks?.onStage?.('archiving');
          if (point === 'during-archiving') {
            requestCancellation();
            hooks?.throwIfCancelled?.();
          }
          if (point === 'before-encryption') {
            requestCancellation();
            hooks?.throwIfCancelled?.();
          }
          hooks?.onStage?.('encrypting');
          return {
            filename: 'cancelled.nvt',
            contentType: 'application/vnd.novel-tool.backup' as const,
            content: Buffer.from('cancelled-archive'),
            encrypted: true
          };
        }
      };
      const filePort =
        point === 'after-archive'
          ? {
              writeOperationFile: async (id: string, name: string, content: Buffer) => {
                const path = await files.writeOperationFile(id, name, content);
                requestCancellation();
                return path;
              },
              removeOperationRoot: (id: string) => files.removeOperationRoot(id)
            }
          : files;
      const executor = new CreateBackupOperationExecutor(command, artifacts, filePort);
      const operation = harness.coordinator.start(
        startInput({
          idempotencyKey: `request-${point}`,
          requestFingerprint: `fingerprint-${point}`,
          progressTotal: CreateBackupOperationExecutor.progressTotal(true)
        }),
        executor,
        { password: 'exact password', settings: {} }
      );
      operationId = operation.id;

      const cancelled = await waitForState(harness.service, operation.id, 'cancelled');
      assert.equal(cancelled.resultArtifactId, null);
      assert.equal(fixture.repository.findArtifact(`artifact-${point}`), null);
      await assert.rejects(() => access(files.operationRoot(operation.id)), { code: 'ENOENT' });
    });
  }
});

test('archive cancellation callback is exercised during JSZip payload generation', async () => {
  const archive = new JsZipBackupArchive({ appVersion: '1.0.0', schemaVersion: 1 });
  let archiving = false;
  let callbacksAfterArchiving = 0;
  await assert.rejects(
    () =>
      archive.create(
        {
          database: Buffer.from('database'),
          contributors: { library: { rows: [1, 2, 3] } },
          settings: { theme: 'dark' }
        },
        undefined,
        {
          onStage(stage) {
            if (stage === 'archiving') archiving = true;
          },
          throwIfCancelled() {
            if (!archiving) return;
            callbacksAfterArchiving += 1;
            throw new BackupOperationError(
              'BACKUP_OPERATION_CANCELLED',
              409,
              'cancel during JSZip update',
              false
            );
          }
        }
      ),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'BACKUP_OPERATION_CANCELLED'
  );
  assert.equal(callbacksAfterArchiving, 1);
});

test('artifact created by the operation executor opens through the unchanged archive contract', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const harness = createHarness(fixture.repository);
  const files = new NodeBackupFileStore(join(fixture.root, 'compatibility-storage'));
  await files.initialize();
  const artifacts = new BackupArtifactService(fixture.repository, files, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') },
    ids: { randomId: () => 'artifact-compatible' }
  });
  const archive = new JsZipBackupArchive({ appVersion: '1.0.0', schemaVersion: 1 });
  const executor = new CreateBackupOperationExecutor(
    {
      async execute(input, hooks) {
        hooks?.onStage?.('collecting');
        const created = await archive.create(
          {
            database: Buffer.from('sqlite-snapshot'),
            contributors: { library: { novels: 2 } },
            settings: input.settings ?? {}
          },
          input.password,
          hooks
        );
        return {
          filename: 'compatible.nvt',
          contentType: 'application/vnd.novel-tool.backup' as const,
          content: created.content,
          encrypted: created.manifest.encrypted
        };
      }
    },
    artifacts,
    files
  );
  const operation = harness.coordinator.start(
    startInput({
      progressTotal: CreateBackupOperationExecutor.progressTotal(true),
      idempotencyKey: 'compatible-request',
      requestFingerprint: 'compatible-fingerprint'
    }),
    executor,
    { password: 'exact password', settings: { theme: 'dark' } }
  );

  const succeeded = await waitForState(harness.service, operation.id, 'succeeded');
  const artifact = fixture.repository.findArtifact(succeeded.resultArtifactId!);
  assert.ok(artifact);
  const opened = await archive.open(await readFile(artifact.path), 'exact password');
  assert.deepEqual(opened.database, Buffer.from('sqlite-snapshot'));
  assert.deepEqual(opened.contributors, { library: { novels: 2 } });
  assert.deepEqual(opened.settings, { theme: 'dark' });
});
