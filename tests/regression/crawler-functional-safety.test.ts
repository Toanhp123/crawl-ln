import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlerEngineService } from '../../apps/api/src/modules/crawler/application/services/crawler-engine.service.js';
import { AnalyzeSourceUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.js';
import { InMemoryRateLimiterService } from '../../apps/api/src/modules/crawler/infrastructure/services/rate-limiter.service.js';
import { RobotsTxtPolicyService } from '../../apps/api/src/modules/crawler/infrastructure/services/robots-policy.service.js';
import type { HtmlDocumentPort } from '../../apps/api/src/shared/ports/html-parser.port.js';
import { env } from '../../apps/api/src/shared/config/env.js';

function chapterDocument(count: number): HtmlDocumentPort {
  const nodes = Array.from({ length: count }, (_, index) => ({ index }));
  return {
    text: (selector) => (selector === 'h1' ? 'Long Novel' : ''),
    html: () => '',
    attr: () => undefined,
    queryAll: (selector) => (selector === '.chapter' ? nodes : []),
    nodeText: (node) => `Chapter ${(node as { index: number }).index + 1}`,
    nodeAttr: (node, name) =>
      name === 'href' ? `/chapter/${(node as { index: number }).index + 1}` : undefined,
    remove: () => undefined
  };
}

test('analyze discovers every chapter even when maxChaptersPerRun is smaller', async () => {
  const engine = new CrawlerEngineService(
    {
      detect: async () => ({
        id: 'x',
        name: 'X',
        hosts: ['example.com'],
        selectors: { title: 'h1', chapterLinks: '.chapter', chapterContent: 'article' },
        crawlPolicy: { maxChaptersPerRun: 2 }
      })
    },
    { get: async () => ({ status: 200, data: '<html />', headers: {} }) },
    { load: () => chapterDocument(5) }
  );
  const result = await engine.analyze('https://example.com/book');
  assert.equal(result.chapters.length, 5);
});

test('analyze accepts www and bare host as the same source host', async () => {
  const useCase = new AnalyzeSourceUseCase(
    [
      {
        canHandle: async () => true,
        analyzeNovel: async () => ({
          title: 'Novel',
          sourceUrl: 'https://example.com/book',
          sourceName: 'X',
          chapters: [{ index: 1, title: 'One', url: 'https://www.example.com/chapter/1' }]
        }),
        fetchChapter: async () => ({ title: 'One', content: 'x' })
      }
    ],
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
