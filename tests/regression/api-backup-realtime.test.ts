import assert from 'node:assert/strict';
import test from 'node:test';
import { BackupOperationCoordinator } from '../../apps/api/src/modules/backup/application/services/backup-operation-coordinator.ts';
import { BackupOperationService } from '../../apps/api/src/modules/backup/application/services/backup-operation.service.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';

async function waitForTerminal(service: BackupOperationService, id: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const operation = service.read(id);
    if (!['queued', 'running'].includes(operation.state)) return operation;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Operation did not finish');
}

test('persisted backup transitions publish backup-only invalidations with specific terminal reasons', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const published: Array<{ resources: string[]; reason: string }> = [];
  const service = new BackupOperationService(fixture.repository, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') },
    ids: { randomId: () => 'operation-1' },
    onChanged(reason) {
      published.push({ resources: ['backup'], reason });
    }
  });
  const coordinator = new BackupOperationCoordinator(service, { error: () => undefined });
  const secret = { password: 'must-never-publish' };
  const started = coordinator.start(
    {
      idempotencyKey: 'request-1',
      requestFingerprint: 'fingerprint-1',
      kind: 'backup',
      initialStage: 'queued',
      progressTotal: 2
    },
    {
      async execute(execution) {
        execution.transition({
          stage: 'collecting',
          progressCurrent: 1,
          progressTotal: 2,
          cancellable: true
        });
        execution.transition({
          stage: 'finalizing',
          progressCurrent: 2,
          progressTotal: 2,
          cancellable: false
        });
        return { result: { filename: 'safe.nvt' } };
      }
    },
    secret
  );

  await waitForTerminal(service, started.id);
  assert.deepEqual(
    published.map((event) => event.reason),
    [
      'backup.operation.stage-changed',
      'backup.operation.stage-changed',
      'backup.operation.stage-changed',
      'backup.operation.stage-changed',
      'backup.operation.succeeded'
    ]
  );
  assert.ok(
    published.every((event) => event.resources.length === 1 && event.resources[0] === 'backup')
  );
  assert.doesNotMatch(JSON.stringify(published), /must-never-publish|password|token|stack/i);
});

test('restore success is persisted before final cleanup and one all invalidation', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const trace: string[] = [];
  const service = new BackupOperationService(fixture.repository, {
    clock: { now: () => new Date('2026-07-25T00:00:00.000Z') },
    ids: { randomId: () => 'restore-operation-1' },
    onChanged(reason) {
      trace.push(reason);
    }
  });
  const coordinator = new BackupOperationCoordinator(service, { error: () => undefined });
  const started = coordinator.start(
    {
      idempotencyKey: 'restore-request-1',
      requestFingerprint: 'restore-fingerprint-1',
      kind: 'restore',
      mode: 'merge',
      initialStage: 'queued',
      progressTotal: 1
    },
    {
      async execute(execution) {
        execution.transition({
          stage: 'finalizing',
          progressCurrent: 1,
          progressTotal: 1,
          cancellable: false
        });
        return {
          result: { restoreMode: 'merge' },
          async onSucceeded() {
            assert.equal(service.read(started.id).state, 'succeeded');
            trace.push('cleanup');
          }
        };
      },
      afterSuccess() {
        trace.push('all');
      }
    },
    { inspectionToken: 'secret' }
  );

  await waitForTerminal(service, started.id);
  for (let attempt = 0; attempt < 20 && !trace.includes('all'); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(trace.slice(-3), ['backup.operation.succeeded', 'cleanup', 'all']);
});
