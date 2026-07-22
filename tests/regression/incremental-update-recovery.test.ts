import assert from 'node:assert/strict';
import test from 'node:test';
import type { Chapter, CrawlTask, Novel } from '@novel-tool/shared';
import { UpdateNovelUseCase } from '../../apps/api-legacy/src/modules/novels/application/use-cases/update-novel.usecase.ts';
import { CreateCrawlJobUseCase } from '../../apps/api-legacy/src/modules/crawler/application/use-cases/create-crawl-job.usecase.ts';
import type { AnalyzeNovelUseCase } from '../../apps/api-legacy/src/modules/novels/application/use-cases/analyze-novel.usecase.ts';
import { NovelDetailQueryService } from '../../apps/api-legacy/src/modules/novels/application/services/novel-detail-query.service.ts';
import type { NovelRepository } from '../../apps/api-legacy/src/modules/novels/domain/repositories/novel.repository.ts';
import type { TaskRepository } from '../../apps/api-legacy/src/modules/task/domain/repositories/task.repository.ts';
import { CrawlTaskEntity } from '../../apps/api-legacy/src/modules/task/domain/entities/task.entity.ts';

const now = '2026-07-16T00:00:00.000Z';
const novel: Novel = {
  id: 'n1',
  title: 'Novel',
  sourceUrl: 'https://example.com/novel',
  sourceName: 'Example',
  status: 'completed',
  createdAt: now,
  updatedAt: now
};
const chapter = (id: string, index: number, status: Chapter['status']): Chapter => ({
  id,
  novelId: 'n1',
  index,
  title: `Chapter ${index}`,
  sourceUrl: `https://example.com/chapter/${index}`,
  status
});

class MemoryNovelRepository implements NovelRepository {
  value: { novel: Novel; chapters: Chapter[] };
  constructor(chapters: Chapter[]) {
    this.value = { novel, chapters };
  }
  async findAll() {
    return [this.value.novel];
  }
  async findById(id: string) {
    return id === 'n1' ? this.value.novel : null;
  }
  async findBySourceUrl(url: string) {
    return url === novel.sourceUrl ? this.value.novel : null;
  }
  async search() {
    return [this.value.novel];
  }
  async updateNovel(value: Novel) {
    this.value.novel = value;
  }
}

function createNovelDetails(novels: MemoryNovelRepository) {
  return new NovelDetailQueryService(novels, {
    listByNovelId: async (novelId: string) =>
      novelId === novels.value.novel.id ? novels.value.chapters : []
  });
}

function createCrawlerNovelPort(novels: MemoryNovelRepository) {
  const details = createNovelDetails(novels);
  return {
    findById: (id: string) => details.findById(id),
    markCrawling: (value: Novel, at: string) => ({
      ...value,
      status: 'crawling' as const,
      updatedAt: at
    }),
    markCompleted: (value: Novel, at: string) => ({
      ...value,
      status: 'completed' as const,
      updatedAt: at
    }),
    markFailed: (value: Novel, at: string) => ({
      ...value,
      status: 'failed' as const,
      updatedAt: at
    })
  };
}

class MemoryTaskRepository implements TaskRepository {
  created: CrawlTask | null = null;
  chapterIds: string[] = [];
  async create(task: CrawlTask, chapterIds: string[] = []) {
    this.created = task;
    this.chapterIds = chapterIds;
  }
  async update(task: CrawlTask) {
    this.created = task;
  }
  async findById() {
    return this.created;
  }
  async findChapterIds() {
    return this.chapterIds;
  }
  async findByNovelId() {
    return this.created;
  }
  async findAll() {
    return this.created ? [this.created] : [];
  }
  async findRecoverable() {
    return [];
  }
  async hasActiveForNovel() {
    return false;
  }
  createQueued(params: Parameters<typeof CrawlTaskEntity.createQueued>[0]) {
    return CrawlTaskEntity.createQueued(params).toPrimitives();
  }
  markRunning(task: CrawlTask, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).markRunning(at).toPrimitives();
  }
  markPausing(task: CrawlTask, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).markPausing(at).toPrimitives();
  }
  markPaused(task: CrawlTask, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).markPaused(at).toPrimitives();
  }
  markResuming(task: CrawlTask, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).markResuming(at).toPrimitives();
  }
  withTotal(task: CrawlTask, total: number, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).withTotal(total, at).toPrimitives();
  }
  recordChapterResult(
    task: CrawlTask,
    ok: boolean,
    wasFailed: boolean,
    metrics: { currentSpeed: number; averageSpeed: number; etaSeconds?: number },
    at: string
  ) {
    return CrawlTaskEntity.fromPrimitives(task)
      .recordChapterResult(ok, wasFailed, metrics, at)
      .toPrimitives();
  }
  complete(task: CrawlTask, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).complete(at).toPrimitives();
  }
  fail(task: CrawlTask, message: string, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).fail(message, at).toPrimitives();
  }
  cancel(task: CrawlTask, at: string) {
    return CrawlTaskEntity.fromPrimitives(task).cancel(at).toPrimitives();
  }
}

test('crawl task persists only the pending chapter snapshot', async () => {
  const novels = new MemoryNovelRepository([
    chapter('c1', 1, 'fetched'),
    chapter('c2', 2, 'pending'),
    chapter('c3', 3, 'failed')
  ]);
  const tasks = new MemoryTaskRepository();
  const useCase = new CreateCrawlJobUseCase(
    createCrawlerNovelPort(novels),
    tasks,
    { publish: async () => {} },
    {
      enqueue: () => {},
      cancel: () => {},
      pause: async () => {},
      resume: async () => {},
      isRunning: () => false,
      isCancelled: () => false
    },
    { randomId: () => 'task-1' },
    { now: () => new Date(now) },
    { maxChaptersPerRun: 100, concurrency: 1, retry: 0 }
  );
  await useCase.execute('n1');
  assert.deepEqual(tasks.chapterIds, ['c2', 'c3']);
});

test('incremental update queues newly discovered chapters', async () => {
  const novels = new MemoryNovelRepository([chapter('c1', 1, 'fetched')]);
  const analyze = {
    execute: async () => {
      novels.value = {
        novel: { ...novel, status: 'analyzed' },
        chapters: [chapter('c1', 1, 'fetched'), chapter('c2', 2, 'pending')]
      };
    }
  } as unknown as AnalyzeNovelUseCase;
  const queued = {
    execute: async () => ({ id: 'task-1' }) as CrawlTask
  } as unknown as CreateCrawlJobUseCase;
  const result = await new UpdateNovelUseCase(
    novels,
    createNovelDetails(novels),
    analyze,
    queued
  ).execute('n1');
  assert.equal(result.newChapterCount, 1);
  assert.equal(result.pendingChapterCount, 1);
  assert.equal(result.task?.id, 'task-1');
});

test('incremental update preserves completed status when already current', async () => {
  const novels = new MemoryNovelRepository([chapter('c1', 1, 'fetched')]);
  const analyze = {
    execute: async () => {
      novels.value = {
        novel: { ...novel, status: 'analyzed' },
        chapters: [chapter('c1', 1, 'fetched')]
      };
    }
  } as unknown as AnalyzeNovelUseCase;
  const queued = {
    execute: async () => {
      throw new Error('must not queue');
    }
  } as unknown as CreateCrawlJobUseCase;
  const result = await new UpdateNovelUseCase(
    novels,
    createNovelDetails(novels),
    analyze,
    queued
  ).execute('n1');
  assert.equal(result.task, null);
  assert.equal(result.novel.novel.status, 'completed');
});
