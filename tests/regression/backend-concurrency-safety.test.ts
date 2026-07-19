import test from 'node:test';
import assert from 'node:assert/strict';
import { CrawlQueueService } from '../../apps/api/src/modules/crawler/application/services/crawl-queue.service.ts';
import { CreateCrawlJobUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/create-crawl-job.usecase.ts';
import type { TaskRepository } from '../../apps/api/src/modules/task/domain/repositories/task.repository.ts';
import type { CrawlJobRunnerService } from '../../apps/api/src/modules/crawler/application/services/crawl-job-runner.service.ts';

const task = {
  id: 't1',
  novelId: 'n1',
  status: 'queued',
  totalChapters: 1,
  fetchedChapters: 0,
  failedChapters: 0,
  totalPausedMs: 0,
  currentSpeed: 0,
  averageSpeed: 0,
  createdAt: '2026-07-16T00:00:00.000Z',
  updatedAt: '2026-07-16T00:00:00.000Z'
} as const;

test('enqueueing the same task twice runs it once and never marks it failed', async () => {
  let runs = 0;
  let failures = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tasks = { findById: async () => task } as unknown as TaskRepository;
  const runner = {
    run: async () => {
      runs += 1;
      await blocked;
    },
    markFailed: async () => {
      failures += 1;
    }
  } as unknown as CrawlJobRunnerService;
  const queue = new CrawlQueueService(
    tasks,
    runner,
    { now: () => new Date('2026-07-16T00:00:00.000Z') },
    { info() {}, warn() {}, error() {} }
  );

  queue.enqueue('t1');
  queue.enqueue('t1');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runs, 1);
  assert.equal(failures, 0);
  release();
  await new Promise((resolve) => setImmediate(resolve));
});

test('create crawl job rejects a persisted active task before creating another one', async () => {
  let created = 0;
  const novels = {
    findById: async () => ({
      id: 'n1',
      title: 'Novel',
      sourceUrl: 'https://example.com/n1',
      sourceName: 'example',
      status: 'analyzed',
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      autoUpdateEnabled: false,
      updateIntervalMinutes: 1440,
      consecutiveUpdateFailures: 0,
      chapters: [
        {
          id: 'c1',
          novelId: 'n1',
          index: 1,
          title: 'One',
          sourceUrl: 'https://example.com/c1',
          status: 'pending'
        }
      ]
    })
  };
  const tasks = {
    hasActiveForNovel: async () => true,
    create: async () => {
      created += 1;
    }
  };
  const useCase = new CreateCrawlJobUseCase(
    novels as never,
    tasks as never,
    { create: async () => undefined } as never,
    {
      isRunning: () => false,
      enqueue() {},
      cancel: async () => undefined,
      isCancelled: () => false,
      pause: async () => undefined,
      resume: async () => undefined
    } as never,
    { randomId: () => 'id' },
    { now: () => new Date('2026-07-16T00:00:00.000Z') },
    { maxChaptersPerRun: 10, concurrency: 1, retry: 0 }
  );

  await assert.rejects(() => useCase.execute('n1'), /already has an active crawl task/i);
  assert.equal(created, 0);
});
