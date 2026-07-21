import assert from 'node:assert/strict';
import test from 'node:test';
import { BackupMaintenanceCoordinator } from '../../apps/api-next/src/platform/lifecycle/backup-maintenance.coordinator.ts';

test('backup maintenance quiesces queue and scheduler around restore work', async () => {
  const trace: string[] = [];
  const maintenance = new BackupMaintenanceCoordinator(
    {
      begin() {
        trace.push('queue.begin');
      },
      end() {
        trace.push('queue.end');
      }
    },
    [
      {
        async stop() {
          trace.push('outbox.stop');
        },
        start() {
          trace.push('outbox.start');
        }
      },
      {
        async stop() {
          trace.push('scheduler.stop');
        },
        async start() {
          trace.push('scheduler.start');
        }
      }
    ]
  );

  const value = await maintenance.runExclusive(async () => {
    trace.push('work');
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(trace, [
    'queue.begin',
    'outbox.stop',
    'scheduler.stop',
    'work',
    'scheduler.start',
    'outbox.start',
    'queue.end'
  ]);

  trace.length = 0;
  await assert.rejects(
    () =>
      maintenance.runExclusive(async () => {
        trace.push('work');
        throw new Error('restore failed');
      }),
    /restore failed/
  );
  assert.deepEqual(trace, [
    'queue.begin',
    'outbox.stop',
    'scheduler.stop',
    'work',
    'scheduler.start',
    'outbox.start',
    'queue.end'
  ]);
});

test('backup maintenance attempts every restart before releasing the queue', async () => {
  const trace: string[] = [];
  const maintenance = new BackupMaintenanceCoordinator(
    {
      begin() {
        trace.push('queue.begin');
      },
      end() {
        trace.push('queue.end');
      }
    },
    [
      {
        stop() {
          trace.push('outbox.stop');
        },
        start() {
          trace.push('outbox.start');
        }
      },
      {
        stop() {
          trace.push('scheduler.stop');
        },
        start() {
          trace.push('scheduler.start');
          throw new Error('scheduler restart failed');
        }
      }
    ]
  );

  await assert.rejects(() => maintenance.runExclusive(async () => undefined), /restart failed/);
  assert.deepEqual(trace, [
    'queue.begin',
    'outbox.stop',
    'scheduler.stop',
    'scheduler.start',
    'outbox.start',
    'queue.end'
  ]);
});
