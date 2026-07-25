import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import test from 'node:test';
import { BackupOperationError } from '../../apps/api/src/modules/backup/application/errors/backup.error.ts';
import type { BackupControlRepository } from '../../apps/api/src/modules/backup/application/ports/backup-control.repository.ts';
import type { BackupFileStore } from '../../apps/api/src/modules/backup/application/ports/backup-file-store.port.ts';
import { BackupArtifactService } from '../../apps/api/src/modules/backup/application/services/backup-artifact.service.ts';
import { BackupCleanupService } from '../../apps/api/src/modules/backup/application/services/backup-cleanup.service.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import type { CreateBackupOperationRecord } from '../../apps/api/src/modules/backup/domain/backup-operation.models.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';

function operationInput(
  id: string,
  overrides: Partial<CreateBackupOperationRecord> = {}
): CreateBackupOperationRecord {
  return {
    id,
    idempotencyKey: `request-${id}`,
    requestFingerprint: `fingerprint-${id}`,
    kind: 'backup',
    mode: null,
    state: 'running',
    stage: 'finalizing',
    cancellable: false,
    cancelRequestedAt: null,
    progressCurrent: 1,
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

function artifactHarness(
  repository: BackupControlRepository,
  fileStore: BackupFileStore,
  now = '2026-07-25T00:00:00.000Z'
) {
  let id = 0;
  return new BackupArtifactService(repository, fileStore, {
    clock: { now: () => new Date(now) },
    ids: { randomId: () => `artifact-${++id}` }
  });
}

test('managed paths stay private and artifact promotion ignores unsafe display filenames', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const storageDirectory = join(fixture.root, 'storage');
  const fileStore = new NodeBackupFileStore(storageDirectory);
  await fileStore.initialize();
  fixture.repository.createOperation(operationInput('operation-1'));

  const sourcePath = await fileStore.writeOperationFile(
    'operation-1',
    'backup.nvt',
    Buffer.from('archive-content')
  );
  const service = artifactHarness(fixture.repository, fileStore);
  const artifact = await service.createFromOperation({
    operationId: 'operation-1',
    kind: 'user-backup',
    sourcePath,
    filename: '../../secret.sqlite',
    encrypted: true
  });

  const privateRoot = join(storageDirectory, 'backup-temp');
  assert.equal(
    relative(privateRoot, fileStore.operationRoot('operation-safe')).startsWith('..'),
    false
  );
  assert.equal(relative(privateRoot, fileStore.uploadRoot('session-safe')).startsWith('..'), false);
  assert.equal(
    relative(privateRoot, fileStore.inspectionRoot('session-safe')).startsWith('..'),
    false
  );
  assert.throws(() => fileStore.operationRoot('../../outside'), /escapes managed backup storage/);
  assert.equal(artifact.path, join(privateRoot, 'artifacts', artifact.id, 'archive.nvt'));
  assert.equal(artifact.filename, 'secret.sqlite');
  assert.equal(artifact.encrypted, true);
  assert.equal(artifact.sizeBytes, Buffer.byteLength('archive-content'));
  assert.equal(artifact.sha256, createHash('sha256').update('archive-content').digest('hex'));
  assert.equal(artifact.expiresAt, '2026-07-26T00:00:00.000Z');
  assert.equal(existsSync(sourcePath), false);
  assert.equal(await readFile(artifact.path, 'utf8'), 'archive-content');
});

test('download tokens are hashed, one-use, and reissuance invalidates an unused token', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const fileStore = new NodeBackupFileStore(join(fixture.root, 'storage'));
  await fileStore.initialize();
  fixture.repository.createOperation(operationInput('operation-1'));
  const service = artifactHarness(fixture.repository, fileStore);
  const sourcePath = await fileStore.writeOperationFile(
    'operation-1',
    'backup.nvt',
    Buffer.from('downloadable')
  );
  const artifact = await service.createFromOperation({
    operationId: 'operation-1',
    kind: 'user-backup',
    sourcePath,
    filename: 'downloadable.nvt',
    encrypted: false
  });

  const first = await service.issueDownloadToken(operationInput('operation-1').id, artifact.id);
  const storedFirst = fixture.repository.findArtifact(artifact.id)!;
  assert.notEqual(storedFirst.downloadTokenHash, first.token);
  assert.equal(
    storedFirst.downloadTokenHash,
    createHash('sha256').update(first.token, 'utf8').digest('hex')
  );
  assert.equal(first.expiresAt, '2026-07-25T00:10:00.000Z');

  const second = await service.issueDownloadToken('operation-1', artifact.id);
  assert.notEqual(second.token, first.token);
  assert.throws(
    () => service.acceptDownloadToken(first.token),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'BACKUP_DOWNLOAD_TOKEN_INVALID'
  );

  const accepted = service.acceptDownloadToken(second.token);
  assert.equal(accepted.id, artifact.id);
  assert.equal(accepted.downloadTokenConsumedAt, '2026-07-25T00:00:00.000Z');
  assert.throws(
    () => service.acceptDownloadToken(second.token),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'BACKUP_DOWNLOAD_TOKEN_INVALID'
  );
});

test('expired artifacts cannot issue download tokens', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const fileStore = new NodeBackupFileStore(join(fixture.root, 'storage'));
  await fileStore.initialize();
  fixture.repository.createOperation(
    operationInput('operation-expired', {
      state: 'succeeded',
      stage: 'succeeded',
      finishedAt: '2026-07-24T00:00:00.000Z'
    })
  );
  fixture.repository.createArtifact({
    id: 'expired-artifact',
    operationId: 'operation-expired',
    kind: 'user-backup',
    path: join(fixture.root, 'missing-artifact.nvt'),
    filename: 'expired.nvt',
    sizeBytes: 0,
    sha256: '0'.repeat(64),
    encrypted: false,
    createdAt: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-25T00:00:00.000Z',
    downloadTokenHash: null,
    downloadTokenExpiresAt: null,
    downloadTokenConsumedAt: null
  });
  const service = artifactHarness(fixture.repository, fileStore);

  await assert.rejects(
    () => service.issueDownloadToken('operation-expired', 'expired-artifact'),
    (error: unknown) =>
      error instanceof BackupOperationError &&
      error.code === 'BACKUP_ARTIFACT_EXPIRED' &&
      error.status === 410
  );
});

test('cleanup removes expired artifacts before operation metadata and prunes orphan scratch', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const storageDirectory = join(fixture.root, 'storage');
  const fileStore = new NodeBackupFileStore(storageDirectory);
  await fileStore.initialize();

  fixture.repository.createOperation(
    operationInput('expired-operation', {
      state: 'succeeded',
      stage: 'succeeded',
      finishedAt: '2026-07-18T00:00:00.000Z',
      metadataExpiresAt: '2026-07-25T00:00:00.000Z'
    })
  );
  const expiredSource = await fileStore.writeOperationFile(
    'expired-operation',
    'backup.nvt',
    Buffer.from('expired')
  );
  const artifactService = artifactHarness(
    fixture.repository,
    fileStore,
    '2026-07-24T00:00:00.000Z'
  );
  const expiredArtifact = await artifactService.createFromOperation({
    operationId: 'expired-operation',
    kind: 'user-backup',
    sourcePath: expiredSource,
    filename: 'expired.nvt',
    encrypted: false
  });
  assert.equal(expiredArtifact.expiresAt, '2026-07-25T00:00:00.000Z');

  fixture.repository.createOperation(
    operationInput('active-operation', {
      idempotencyKey: 'request-active-operation',
      requestFingerprint: 'fingerprint-active-operation'
    })
  );
  const activeScratch = await fileStore.writeOperationFile(
    'active-operation',
    'scratch.tmp',
    Buffer.from('active')
  );
  const orphanScratch = await fileStore.writeOperationFile(
    'orphan-operation',
    'scratch.tmp',
    Buffer.from('orphan')
  );

  const cleanup = new BackupCleanupService(fixture.repository, fileStore, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') }
  });
  const result = await cleanup.run();

  assert.equal(result.artifactsDeleted, 1);
  assert.equal(result.operationsDeleted, 1);
  assert.equal(result.operationRootsDeleted, 2);
  assert.equal(fixture.repository.findArtifact(expiredArtifact.id), null);
  assert.equal(fixture.repository.findOperation('expired-operation'), null);
  assert.equal(existsSync(dirname(expiredArtifact.path)), false);
  assert.equal(existsSync(activeScratch), true);
  assert.equal(existsSync(orphanScratch), false);
});

test('cleanup leaves rows after a file failure and succeeds idempotently on retry', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const actualStore = new NodeBackupFileStore(join(fixture.root, 'storage'));
  await actualStore.initialize();
  fixture.repository.createOperation(
    operationInput('retry-operation', {
      state: 'succeeded',
      stage: 'succeeded',
      finishedAt: '2026-07-18T00:00:00.000Z',
      metadataExpiresAt: '2026-07-25T00:00:00.000Z'
    })
  );
  const source = await actualStore.writeOperationFile(
    'retry-operation',
    'backup.nvt',
    Buffer.from('retry')
  );
  const artifact = await artifactHarness(
    fixture.repository,
    actualStore,
    '2026-07-24T00:00:00.000Z'
  ).createFromOperation({
    operationId: 'retry-operation',
    kind: 'user-backup',
    sourcePath: source,
    filename: 'retry.nvt',
    encrypted: false
  });

  let failRemoval = true;
  const flakyStore: BackupFileStore = {
    initialize: () => actualStore.initialize(),
    operationRoot: (id) => actualStore.operationRoot(id),
    uploadRoot: (id) => actualStore.uploadRoot(id),
    inspectionRoot: (id) => actualStore.inspectionRoot(id),
    writeOperationFile: (id, name, content) => actualStore.writeOperationFile(id, name, content),
    promoteArtifact: (input) => actualStore.promoteArtifact(input),
    openReadStream: (path) => actualStore.openReadStream(path),
    stat: (path) => actualStore.stat(path),
    async removePath(path) {
      if (failRemoval && path === dirname(artifact.path)) {
        failRemoval = false;
        throw new Error('simulated file failure');
      }
      await actualStore.removePath(path);
    },
    removeOperationRoot: (id) => actualStore.removeOperationRoot(id),
    removeSessionRoot: (id) => actualStore.removeSessionRoot(id),
    listManagedPaths: () => actualStore.listManagedPaths()
  };
  const cleanup = new BackupCleanupService(fixture.repository, flakyStore, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') }
  });

  const first = await cleanup.run();
  assert.equal(first.failures.length, 1);
  assert.ok(fixture.repository.findArtifact(artifact.id));
  assert.ok(fixture.repository.findOperation('retry-operation'));

  const second = await cleanup.run();
  assert.equal(second.failures.length, 0);
  assert.equal(fixture.repository.findArtifact(artifact.id), null);
  assert.equal(fixture.repository.findOperation('retry-operation'), null);
  assert.equal(existsSync(dirname(artifact.path)), false);
});

test('managed path listing returns namespace children only', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const store = new NodeBackupFileStore(join(fixture.root, 'storage'));
  await store.initialize();
  await store.writeOperationFile('operation-1', 'nested/archive.nvt', Buffer.from('one'));
  const paths = await store.listManagedPaths();
  assert.ok(paths.some((path) => path.endsWith(`${sep}operations${sep}operation-1`)));
  assert.equal(
    paths.some((path) => path.endsWith(`${sep}archive.nvt`)),
    false
  );
});
