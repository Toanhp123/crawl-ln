import assert from 'node:assert/strict';
import test from 'node:test';
import { RecoverCrawlJobsUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/recover-crawl-jobs.usecase.ts';
import { CreateCrawlJobUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/create-crawl-job.usecase.ts';
import { CrawlTaskEntity } from '../../apps/api/src/modules/task/domain/entities/task.entity.ts';
import type { CrawlTask } from '@novel-tool/shared';

const now = '2026-07-16T00:00:00.000Z';
const queued = (id: string): CrawlTask =>
  CrawlTaskEntity.createQueued({ id, novelId: `n-${id}`, totalChapters: 1, now }).toPrimitives();

test('recovery drains every interrupted batch', async () => {
  const values = Array.from({ length: 450 }, (_, i) => queued(`t${i}`));
  const updated: CrawlTask[] = [];
  const useCase = new RecoverCrawlJobsUseCase(
    {
      findInterrupted: async (limit = 200) =>
        values.filter((v) => !updated.some((u) => u.id === v.id)).slice(0, limit),
      update: async (task) => {
        updated.push(task);
      },
      markPaused: (task, at) => CrawlTaskEntity.fromPrimitives(task).markPaused(at).toPrimitives()
    } as never,
    { publish: async () => {} },
    { now: () => new Date(now) },
    { randomId: () => crypto.randomUUID() }
  );
  const result = await useCase.execute(200);
  assert.equal(result.length, 450);
  assert.ok(result.every((task) => task.status === 'paused'));
});

test('task creation compensates a persisted task when enqueue fails and ignores audit failure', async () => {
  let stored: CrawlTask | null = null;
  const tasks = {
    hasActiveForNovel: async () => false,
    createQueued: (p: Parameters<typeof CrawlTaskEntity.createQueued>[0]) =>
      CrawlTaskEntity.createQueued(p).toPrimitives(),
    create: async (task: CrawlTask) => {
      stored = task;
    },
    update: async (task: CrawlTask) => {
      stored = task;
    },
    fail: (task: CrawlTask, message: string, at: string) =>
      CrawlTaskEntity.fromPrimitives(task).fail(message, at).toPrimitives()
  };
  const useCase = new CreateCrawlJobUseCase(
    {
      findById: async () => ({ novel: { id: 'n1' }, chapters: [{ id: 'c1', status: 'pending' }] })
    } as never,
    tasks as never,
    {
      publish: async () => {
        throw new Error('audit down');
      }
    },
    {
      isRunning: () => false,
      enqueue: () => {
        throw new Error('queue down');
      }
    } as never,
    { randomId: () => 't1' },
    { now: () => new Date(now) },
    { maxChaptersPerRun: 10, concurrency: 1, retry: 0 }
  );
  await assert.rejects(() => useCase.execute('n1'), /queue down/);
  assert.equal(stored?.status, 'failed');
  assert.match(stored?.errorMessage ?? '', /queue down/);
});
