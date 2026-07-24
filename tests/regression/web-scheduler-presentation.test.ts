import assert from 'node:assert/strict';
import test from 'node:test';

test('Scheduler display state gives active runs priority', async () => {
  const { getSchedulerDisplayState } =
    await import('../../apps/web/src/features/run-scheduler/model/scheduler-presentation.ts');

  assert.deepEqual(getSchedulerDisplayState({ running: false, activeRuns: 2 }), {
    key: 'running',
    tone: 'info'
  });
  assert.deepEqual(getSchedulerDisplayState({ running: true, activeRuns: 0 }), {
    key: 'enabled',
    tone: 'success'
  });
  assert.deepEqual(getSchedulerDisplayState({ running: false, activeRuns: 0 }), {
    key: 'disabled',
    tone: 'neutral'
  });
});

test('Scheduler timestamps provide relative and absolute locale-aware values', async () => {
  const { formatSchedulerTimestamp } =
    await import('../../apps/web/src/features/run-scheduler/model/scheduler-time.ts');

  const now = Date.parse('2026-07-24T16:00:00.000Z');
  const result = formatSchedulerTimestamp('2026-07-24T15:58:00.000Z', {
    locale: 'en-US',
    now,
    timeZone: 'UTC'
  });

  assert.ok(result);
  assert.equal(result.relative, '2 minutes ago');
  assert.match(result.absolute, /Jul 24, 2026/);
  assert.match(result.absolute, /3:58 PM|15:58/);
});

test('Scheduler timestamp formatting fails safely for missing and invalid values', async () => {
  const { formatSchedulerTimestamp } =
    await import('../../apps/web/src/features/run-scheduler/model/scheduler-time.ts');

  assert.equal(formatSchedulerTimestamp(undefined, { locale: 'en-US', now: 0 }), null);
  assert.equal(formatSchedulerTimestamp('not-a-date', { locale: 'en-US', now: 0 }), null);
});
