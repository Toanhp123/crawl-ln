import test from 'node:test';
import assert from 'node:assert/strict';
import { CrawlJobRunnerService } from '../../apps/api/src/modules/crawler/application/services/crawl-job-runner.service.ts';
import { CrawlQueueService } from '../../apps/api/src/modules/crawler/application/services/crawl-queue.service.ts';
import { CrawlTaskEntity } from '../../apps/api/src/modules/task/domain/entities/task.entity.ts';
import type { CrawlerTaskPort } from '../../apps/api/src/modules/crawler/application/ports/crawler-task.port.ts';

const now = '2026-07-16T00:00:00.000Z';
const terminalTask = (status: 'completed' | 'failed' | 'cancelled') => ({
  id: 't1',
  novelId: 'n1',
  status,
  outcome:
    status === 'completed'
      ? ('success' as const)
      : status === 'failed'
        ? ('failure' as const)
        : undefined,
  totalChapters: 1,
  fetchedChapters: status === 'completed' ? 1 : 0,
  failedChapters: status === 'failed' ? 1 : 0,
  totalPausedMs: 0,
  currentSpeed: 0,
  averageSpeed: 0,
  createdAt: now,
  updatedAt: now,
  finishedAt: now
});

function taskGateway(overrides: Partial<CrawlerTaskPort>): CrawlerTaskPort {
  const transition = (task: Parameters<typeof CrawlTaskEntity.fromPrimitives>[0]) =>
    CrawlTaskEntity.fromPrimitives(task);
  return {
    create: async () => undefined,
    update: async () => undefined,
    findById: async () => null,
    findChapterIds: async () => [],
    findRecoverable: async () => [],
    hasActiveForNovel: async () => false,
    createQueued: (params) => CrawlTaskEntity.createQueued(params).toPrimitives(),
    markRunning: (task, at) => transition(task).markRunning(at).toPrimitives(),
    markPausing: (task, at) => transition(task).markPausing(at).toPrimitives(),
    markPaused: (task, at) => transition(task).markPaused(at).toPrimitives(),
    markResuming: (task, at) => transition(task).markResuming(at).toPrimitives(),
    withTotal: (task, total, at) => transition(task).withTotal(total, at).toPrimitives(),
    recordChapterResult: (task, ok, wasFailed, metrics, at) =>
      transition(task).recordChapterResult(ok, wasFailed, metrics, at).toPrimitives(),
    complete: (task, at) => transition(task).complete(at).toPrimitives(),
    fail: (task, message, at) => transition(task).fail(message, at).toPrimitives(),
    cancel: (task, at) => transition(task).cancel(at).toPrimitives(),
    ...overrides
  };
}

function runnerFor(tasks: CrawlerTaskPort, eventCreate = async () => undefined) {
  return new CrawlJobRunnerService(
    {} as never,
    tasks,
    { create: eventCreate } as never,
    {} as never,
    { maxChaptersPerRun: 10, concurrency: 2, retry: 0 },
    { now: () => new Date(now) },
    { randomId: () => 'event-1' },
    { start() {}, record: () => ({ currentSpeed: 0, averageSpeed: 0 }), finish() {} } as never,
    {
      persistStart: async () => undefined,
      persistChapterResult: async () => undefined,
      persistFinal: async () => undefined
    }
  );
}

test('markFailed never overwrites terminal task states', async () => {
  for (const status of ['completed', 'failed', 'cancelled'] as const) {
    let updates = 0;
    let events = 0;
    const tasks = taskGateway({
      findById: async () => terminalTask(status),
      update: async () => {
        updates += 1;
      }
    });
    await runnerFor(tasks, async () => {
      events += 1;
    }).markFailed('t1', 'late failure');
    assert.equal(updates, 0, status);
    assert.equal(events, 0, status);
  }
});

test('cancelling a queued task is finalized by the queue', async () => {
  let stored = {
    ...terminalTask('cancelled'),
    status: 'queued' as const,
    outcome: undefined,
    finishedAt: undefined
  };
  const tasks = taskGateway({
    findById: async () => stored,
    update: async (task) => {
      stored = task as typeof stored;
    }
  });
  const queue = new CrawlQueueService(
    tasks,
    runnerFor(tasks),
    { now: () => new Date(now) },
    { info() {}, warn() {}, error() {} }
  );
  await queue.cancel('t1');
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.finishedAt, now);
});
