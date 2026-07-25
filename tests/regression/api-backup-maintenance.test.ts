import assert from 'node:assert/strict';
import test from 'node:test';
import { BackupMaintenanceCoordinator } from '../../apps/api/src/platform/lifecycle/backup-maintenance.coordinator.ts';

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

test('backup maintenance rejects overlapping work without touching the queue twice', async () => {
  const trace: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const maintenance = new BackupMaintenanceCoordinator(
    {
      begin() {
        trace.push('queue.begin');
      },
      end() {
        trace.push('queue.end');
      }
    },
    []
  );

  const first = maintenance.runExclusive(async () => {
    trace.push('first.work');
    await gate;
  });
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(
    () => maintenance.runExclusive(async () => trace.push('second.work')),
    /already running/
  );
  assert.deepEqual(trace, ['queue.begin', 'first.work']);
  release();
  await first;
  assert.deepEqual(trace, ['queue.begin', 'first.work', 'queue.end']);
});

test('backup maintenance restarts only successfully stopped services when quiescing fails', async () => {
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
          throw new Error('scheduler stop failed');
        },
        start() {
          trace.push('scheduler.start');
        }
      }
    ]
  );

  await assert.rejects(
    () => maintenance.runExclusive(async () => trace.push('work')),
    /scheduler stop failed/
  );
  assert.deepEqual(trace, [
    'queue.begin',
    'outbox.stop',
    'scheduler.stop',
    'outbox.start',
    'queue.end'
  ]);
});
