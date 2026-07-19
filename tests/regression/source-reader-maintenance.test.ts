import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderMaintenanceService } from '../../apps/api/src/modules/source-reader/application/services/source-reader-maintenance.service.ts';

test('maintenance expires cache, sessions, and challenges in one pass', async () => {
  const calls: string[] = [];
  const service = new SourceReaderMaintenanceService(
    { deleteExpired: async () => (calls.push('cache'), 1) },
    { expireBefore: async () => (calls.push('sessions'), 1) },
    { expireBefore: async () => (calls.push('challenges'), 1) },
    () => new Date('2026-07-19T00:00:00.000Z')
  );
  await service.runOnce();
  assert.deepEqual(calls.sort(), ['cache', 'challenges', 'sessions']);
});

test('maintenance start and stop are idempotent', async () => {
  const service = new SourceReaderMaintenanceService(
    { deleteExpired: async () => 0 },
    { expireBefore: async () => 0 },
    { expireBefore: async () => 0 },
    () => new Date('2026-07-19T00:00:00.000Z'),
    60_000
  );
  service.start();
  service.start();
  await service.stop();
  await service.stop();
});
