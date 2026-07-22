import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CrawlTaskEntity,
  InvalidTaskTransitionError
} from '../../apps/api-legacy/src/modules/task/domain/entities/task.entity.ts';
import { CrawlQueueService } from '../../apps/api-legacy/src/modules/crawler/application/services/crawl-queue.service.ts';
import { AutoUpdateSchedulerService } from '../../apps/api-legacy/src/modules/scheduler/application/auto-update-scheduler.service.ts';
import { CrawlerConflictError } from '../../apps/api-legacy/src/modules/crawler/application/errors/crawler.error.ts';
import { buildAxiosRequestConfig } from '../../apps/api-legacy/src/shared/infrastructure/http/axios-http-client.adapter.ts';
import type { TaskRepository } from '../../apps/api-legacy/src/modules/task/domain/repositories/task.repository.ts';
import type { AutoUpdatePolicyRepository } from '../../apps/api-legacy/src/modules/scheduler/application/ports/auto-update-policy.repository.ts';
import type { SchedulerDiagnosticsRepository } from '../../apps/api-legacy/src/modules/scheduler/application/ports/scheduler-diagnostics.repository.ts';

const now = '2026-07-16T00:00:00.000Z';
const task = () =>
  CrawlTaskEntity.createQueued({ id: 't1', novelId: 'n1', totalChapters: 1, now }).toPrimitives();

const novel = {
  id: 'n1',
  title: 'Novel',
  sourceUrl: 'https://example.com/n1',
  sourceName: 'example',
  status: 'completed' as const,
  createdAt: now,
  updatedAt: now,
  autoUpdateEnabled: true,
  updateIntervalMinutes: 360 as const,
  consecutiveUpdateFailures: 0
};

test('task entity rejects reopening terminal states', () => {
  const completed = CrawlTaskEntity.fromPrimitives({
    ...task(),
    status: 'completed',
    finishedAt: now
  });
  assert.throws(() => completed.markRunning(now), InvalidTaskTransitionError);
  assert.throws(() => completed.fail('late', now), InvalidTaskTransitionError);
  assert.throws(() => completed.cancel(now), InvalidTaskTransitionError);
});

test('queue stop aborts an in-flight task and waits for runner completion', async () => {
  let finished = false;
  const tasks = {
    findById: async () => task(),
    update: async () => undefined
  } as unknown as TaskRepository;
  const runner = {
    run: async (_id: string, control: { signal(id: string): AbortSignal | undefined }) => {
      const signal = control.signal('t1');
      await new Promise<void>((resolve) =>
        signal?.addEventListener('abort', () => resolve(), { once: true })
      );
      finished = true;
    },
    markFailed: async () => undefined
  };
  const queue = new CrawlQueueService(
    tasks,
    runner as never,
    { now: () => new Date(now) },
    { info() {}, warn() {}, error() {} }
  );
  queue.enqueue('t1');
  await new Promise((resolve) => setImmediate(resolve));
  await queue.stop();
  assert.equal(finished, true);
  assert.throws(() => queue.enqueue('t2'), /shutting down/i);
});

test('scheduler stop waits for the current tick', async () => {
  let release!: () => void;
  let completed = false;
  const policies = {
    listDue: async () => [novel],
    recordState: async () => undefined,
    countMonitored: async () => 1,
    countDue: async () => 1
  } as unknown as AutoUpdatePolicyRepository;
  const service = new AutoUpdateSchedulerService(
    policies,
    { hasActiveForNovel: async () => false } as unknown as TaskRepository,
    {
      add: async () => undefined,
      listByNovel: async () => [],
      pruneByNovel: async () => undefined
    } as SchedulerDiagnosticsRepository,
    {
      execute: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        completed = true;
        return { task: null, newChapterCount: 0, pendingChapterCount: 0 };
      }
    },
    { now: () => new Date(now) },
    { randomId: () => 'd1' },
    { info() {}, warn() {}, error() {} }
  );
  const tick = service.tick();
  await new Promise((resolve) => setImmediate(resolve));
  let stopped = false;
  const stop = service.stop().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped, false);
  release();
  await Promise.all([tick, stop]);
  assert.equal(completed, true);
  assert.equal(stopped, true);
});

test('scheduler treats a concurrent active-task conflict as skipped instead of failed', async () => {
  const states: Array<{ result: string; consecutiveFailures: number }> = [];
  const service = new AutoUpdateSchedulerService(
    {
      listDue: async () => [novel],
      recordState: async (_id, state) => {
        states.push(state);
      },
      countMonitored: async () => 1,
      countDue: async () => 1
    } as unknown as AutoUpdatePolicyRepository,
    { hasActiveForNovel: async () => false } as unknown as TaskRepository,
    {
      add: async () => undefined,
      listByNovel: async () => [],
      pruneByNovel: async () => undefined
    } as SchedulerDiagnosticsRepository,
    {
      execute: async () => {
        throw new CrawlerConflictError('Novel already has an active crawl task');
      }
    },
    { now: () => new Date(now) },
    { randomId: () => 'd1' },
    { info() {}, warn() {}, error() {} }
  );
  await service.tick();
  assert.equal(states[0]?.result, 'skipped_active_task');
  assert.equal(states[0]?.consecutiveFailures, 0);
});

test('axios request config forwards AbortSignal', () => {
  const controller = new AbortController();
  assert.equal(buildAxiosRequestConfig({ signal: controller.signal }).signal, controller.signal);
});
