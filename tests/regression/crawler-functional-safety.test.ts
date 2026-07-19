import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyzeSourceUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.js';
import { InMemoryRateLimiterService } from '../../apps/api/src/modules/crawler/infrastructure/services/rate-limiter.service.js';
import { RobotsTxtPolicyService } from '../../apps/api/src/modules/crawler/infrastructure/services/robots-policy.service.js';
import { env } from '../../apps/api/src/shared/config/env.js';

test('analyze accepts www and bare host as the same source host', async () => {
  const useCase = new AnalyzeSourceUseCase(
    {
      readMetadata: async () => ({
        data: {
          title: 'Novel',
          sourceUrl: 'https://example.com/book',
          sourceName: 'X'
        },
        source: {
          pluginId: 'demo',
          pluginVersion: '1.0.0',
          domain: 'example.com',
          capability: 'metadata'
        }
      }),
      streamChapterList: async function* () {
        yield {
          data: [{ index: 1, title: 'One', url: 'https://www.example.com/chapter/1' }],
          source: {
            pluginId: 'demo',
            pluginVersion: '1.0.0',
            domain: 'example.com',
            capability: 'chapter-list'
          }
        };
      },
      readChapterContent: async () => {
        throw new Error('not used');
      }
    },
    { check: async () => ({ allowed: true }) }
  );
  const result = await useCase.execute('https://example.com/book');
  assert.equal(result.chapters.length, 1);
});

test('rate limiter reserves sequential slots before awaiting', async () => {
  let now = 0;
  const waits: number[] = [];
  const limiter = new InMemoryRateLimiterService({
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
    },
    minimumDelayMs: 10
  });
  await Promise.all([
    limiter.wait('example.com'),
    limiter.wait('example.com'),
    limiter.wait('example.com')
  ]);
  assert.deepEqual(waits, [10, 20]);
});

test('robots cache expires and refetches rules', async () => {
  let now = 0;
  let requests = 0;
  const service = new RobotsTxtPolicyService(
    {
      get: async () => {
        requests += 1;
        return { status: 200, data: 'User-agent: *\nAllow: /', headers: {} };
      }
    },
    { now: () => now, successTtlMs: 100, failureTtlMs: 10 }
  );
  env.sourceAllowlist.splice(0, env.sourceAllowlist.length, 'example.com');
  await service.check('https://example.com/a');
  await service.check('https://example.com/b');
  now = 101;
  await service.check('https://example.com/c');
  assert.equal(requests, 2);
});

test('cancel waits until a running task is persisted as cancelled', async () => {
  const { CrawlQueueService } =
    await import('../../apps/api/src/modules/crawler/application/services/crawl-queue.service.js');
  let stored = {
    id: 't1',
    novelId: 'n1',
    status: 'queued' as const,
    totalChapters: 1,
    fetchedChapters: 0,
    failedChapters: 0,
    totalPausedMs: 0,
    currentSpeed: 0,
    averageSpeed: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const tasks = {
    findById: async () => stored,
    update: async (task: typeof stored) => {
      stored = task;
    },
    cancel: (task: typeof stored, now: string) => ({
      ...task,
      status: 'cancelled' as const,
      finishedAt: now,
      updatedAt: now
    })
  };
  const runner = {
    run: async (_taskId: string, control: { isCancelled(id: string): boolean }) => {
      while (!control.isCancelled('t1')) await new Promise((resolve) => setTimeout(resolve, 1));
      await tasks.update(tasks.cancel(stored, '2026-01-01T00:00:01.000Z'));
    },
    markFailed: async () => undefined
  };
  const queue = new CrawlQueueService(
    tasks as never,
    runner as never,
    { now: () => new Date('2026-01-01T00:00:01.000Z') },
    { info() {}, warn() {}, error() {} }
  );
  queue.enqueue('t1');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await queue.cancel('t1');
  assert.equal(stored.status, 'cancelled');
});
