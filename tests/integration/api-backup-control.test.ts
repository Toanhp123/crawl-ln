import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import type {
  BackupOperationState,
  CreateBackupOperationRecord
} from '../../apps/api/src/modules/backup/domain/backup-operation.models.ts';
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
    state: 'queued',
    stage: 'queued',
    cancellable: true,
    cancelRequestedAt: null,
    progressCurrent: 0,
    progressTotal: 1,
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

function terminalOperation(
  id: string,
  state: Exclude<BackupOperationState, 'queued' | 'running'> = 'succeeded',
  overrides: Partial<CreateBackupOperationRecord> = {}
): CreateBackupOperationRecord {
  return operationInput(id, {
    state,
    stage: state,
    cancellable: false,
    finishedAt: '2026-07-25T01:00:00.000Z',
    updatedAt: '2026-07-25T01:00:00.000Z',
    ...overrides
  });
}

test('backup control schema creates constrained operations and artifacts', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const operationsSql = fixture.database.connection
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'backup_operations'")
    .get() as { sql: string };
  const artifactsSql = fixture.database.connection
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'backup_artifacts'")
    .get() as { sql: string };
  const activeIndex = fixture.database.connection
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = 'backup_operations_one_active'"
    )
    .get() as { sql: string };

  assert.match(
    operationsSql.sql,
    /state IN \('queued','running','succeeded','failed','interrupted','cancelled'\)/
  );
  assert.match(activeIndex.sql, /WHERE state IN \('queued','running'\)/);
  assert.match(artifactsSql.sql, /FOREIGN KEY\(operation_id\).*ON DELETE CASCADE/);
  assert.equal(fixture.path, join(fixture.root, 'backup-control.sqlite'));
});

test('backup control schema enforces exactly one active operation', async (context) => {
  const fixture = await createBackupControlFixture(context);
  fixture.repository.createOperation(operationInput('operation-1'));

  assert.throws(
    () =>
      fixture.repository.createOperation(
        operationInput('operation-2', {
          state: 'running'
        })
      ),
    /UNIQUE constraint failed/
  );

  fixture.repository.updateOperation('operation-1', {
    state: 'succeeded',
    stage: 'succeeded',
    cancellable: false,
    finishedAt: '2026-07-25T01:00:00.000Z',
    updatedAt: '2026-07-25T01:00:00.000Z'
  });
  const second = fixture.repository.createOperation(
    operationInput('operation-2', { state: 'running' })
  );
  assert.equal(second.id, 'operation-2');
});

test('operation rows round-trip JSON records and booleans', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const created = fixture.repository.createOperation(
    terminalOperation('json-operation', 'failed', {
      kind: 'restore',
      mode: 'merge',
      cancellable: false,
      errorCode: 'RESTORE_INVALID',
      errorDetails: { retry: false, nested: { count: 2 } },
      result: { inventory: { novels: 4 } }
    })
  );

  assert.deepEqual(created.errorDetails, { retry: false, nested: { count: 2 } });
  assert.deepEqual(created.result, { inventory: { novels: 4 } });
  assert.equal(created.cancellable, false);
  assert.deepEqual(fixture.repository.findOperation(created.id), created);
});

test('artifact rows round-trip encrypted flags and token metadata', async (context) => {
  const fixture = await createBackupControlFixture(context);
  fixture.repository.createOperation(terminalOperation('artifact-operation'));
  const created = fixture.repository.createArtifact({
    id: 'artifact-1',
    operationId: 'artifact-operation',
    kind: 'user-backup',
    path: join(fixture.root, 'artifact-1.nvt'),
    filename: 'backup.nvt',
    sizeBytes: 42,
    sha256: 'a'.repeat(64),
    encrypted: true,
    createdAt: '2026-07-25T01:00:00.000Z',
    expiresAt: '2026-07-26T01:00:00.000Z',
    downloadTokenHash: null,
    downloadTokenExpiresAt: null,
    downloadTokenConsumedAt: null
  });
  const updated = fixture.repository.updateArtifactToken(created.id, {
    downloadTokenHash: 'b'.repeat(64),
    downloadTokenExpiresAt: '2026-07-25T01:10:00.000Z',
    downloadTokenConsumedAt: null
  });

  assert.equal(created.encrypted, true);
  assert.equal(updated.downloadTokenHash, 'b'.repeat(64));
  assert.equal(updated.downloadTokenConsumedAt, null);
  assert.deepEqual(fixture.repository.findArtifact(created.id), updated);
});

test('active operation wins deterministic active-or-latest ordering', async (context) => {
  const fixture = await createBackupControlFixture(context);
  fixture.repository.createOperation(
    terminalOperation('latest-terminal', 'succeeded', {
      updatedAt: '2026-07-25T05:00:00.000Z'
    })
  );
  fixture.repository.createOperation(
    terminalOperation('older-terminal', 'failed', {
      updatedAt: '2026-07-25T04:00:00.000Z'
    })
  );
  assert.equal(fixture.repository.findActiveOrLatestOperation()?.id, 'latest-terminal');

  fixture.repository.createOperation(
    operationInput('active', {
      updatedAt: '2026-07-25T00:00:00.000Z'
    })
  );
  assert.equal(fixture.repository.findActiveOrLatestOperation()?.id, 'active');
  assert.equal(fixture.repository.findActiveOperation()?.id, 'active');
});

test('metadata expiry deletes only terminal operations at or before the boundary', async (context) => {
  const fixture = await createBackupControlFixture(context);
  fixture.repository.createOperation(
    terminalOperation('expired', 'succeeded', {
      metadataExpiresAt: '2026-07-25T02:00:00.000Z'
    })
  );
  fixture.repository.createOperation(
    terminalOperation('future', 'failed', {
      metadataExpiresAt: '2026-07-25T03:00:00.001Z'
    })
  );
  fixture.repository.createOperation(
    operationInput('active-expired', {
      metadataExpiresAt: '2026-07-25T01:00:00.000Z'
    })
  );

  assert.equal(fixture.repository.deleteOperationsExpiredBefore('2026-07-25T03:00:00.000Z'), 1);
  assert.equal(fixture.repository.findOperation('expired'), null);
  assert.ok(fixture.repository.findOperation('future'));
  assert.ok(fixture.repository.findOperation('active-expired'));
});

test('expired artifact listing is inclusive and does not delete rows', async (context) => {
  const fixture = await createBackupControlFixture(context);
  fixture.repository.createOperation(terminalOperation('artifact-owner'));
  for (const [id, expiresAt] of [
    ['expired-before', '2026-07-25T01:59:59.999Z'],
    ['expired-boundary', '2026-07-25T02:00:00.000Z'],
    ['future', '2026-07-25T02:00:00.001Z']
  ] as const) {
    fixture.repository.createArtifact({
      id,
      operationId: 'artifact-owner',
      kind: 'user-backup',
      path: join(fixture.root, `${id}.nvt`),
      filename: `${id}.nvt`,
      sizeBytes: 1,
      sha256: id.padEnd(64, '0').slice(0, 64),
      encrypted: false,
      createdAt: '2026-07-25T01:00:00.000Z',
      expiresAt,
      downloadTokenHash: null,
      downloadTokenExpiresAt: null,
      downloadTokenConsumedAt: null
    });
  }

  assert.deepEqual(
    fixture.repository
      .listArtifactsExpiredBefore('2026-07-25T02:00:00.000Z')
      .map((artifact) => artifact.id),
    ['expired-before', 'expired-boundary']
  );
  assert.ok(fixture.repository.findArtifact('expired-before'));
  assert.ok(fixture.repository.findArtifact('expired-boundary'));
});

test('repository transaction rolls back all writes after an exception', async (context) => {
  const fixture = await createBackupControlFixture(context);
  assert.throws(
    () =>
      fixture.repository.transaction(() => {
        fixture.repository.createOperation(terminalOperation('rolled-back'));
        throw new Error('force rollback');
      }),
    /force rollback/
  );
  assert.equal(fixture.repository.findOperation('rolled-back'), null);
});
