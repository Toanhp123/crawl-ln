import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRuntime } from './api-next.runtime.ts';
import { currentApiRuntime } from './current-api.runtime.ts';
import { withContractServer } from './http-server.harness.ts';

interface SuccessEnvelope<T> {
  data: T;
  error: null;
}

interface SchedulerStatus {
  running: boolean;
  tickIntervalMs: number;
  monitoredNovels: number;
  dueNovels: number;
  activeRuns: number;
  lastTickAt?: string;
  nextTickAt?: string;
  lastTickDurationMs?: number;
}

function assertStatus(value: SchedulerStatus): void {
  assert.equal(typeof value.running, 'boolean');
  assert.equal(value.tickIntervalMs, 60_000);
  assert.equal(value.monitoredNovels, 0);
  assert.equal(value.dueNovels, 0);
  assert.equal(value.activeRuns, 0);
}

async function assertSchedulerHttpContract(baseUrl: string): Promise<void> {
  const status = await fetch(`${baseUrl}/api/scheduler/status`);
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as SuccessEnvelope<SchedulerStatus>;
  assert.equal(statusBody.error, null);
  assertStatus(statusBody.data);

  const tick = await fetch(`${baseUrl}/api/scheduler/tick`, { method: 'POST' });
  assert.equal(tick.status, 200);
  assertStatus(((await tick.json()) as SuccessEnvelope<SchedulerStatus>).data);

  const missingPolicy = await fetch(`${baseUrl}/api/novels/missing/auto-update`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, intervalMinutes: 360 })
  });
  assert.equal(missingPolicy.status, 404);
  assert.deepEqual(await missingPolicy.json(), {
    data: null,
    error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }
  });

  const invalidPolicy = await fetch(`${baseUrl}/api/novels/missing/auto-update`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, intervalMinutes: 42 })
  });
  assert.equal(invalidPolicy.status, 400);
  assert.equal(
    ((await invalidPolicy.json()) as { error: { code: string } }).error.code,
    'VALIDATION_ERROR'
  );

  const diagnostics = await fetch(`${baseUrl}/api/novels/missing/update-diagnostics`);
  assert.equal(diagnostics.status, 200);
  assert.deepEqual(await diagnostics.json(), { data: [], error: null });
}

for (const [name, runtime] of [
  ['current', currentApiRuntime],
  ['next', apiRuntime]
] as const) {
  test(`${name} API preserves the scheduler HTTP contract`, async () => {
    await withContractServer(runtime, assertSchedulerHttpContract);
  });
}
