import assert from 'node:assert/strict';
import test from 'node:test';
import { PauseJobCommandHandler } from '../../apps/api/src/modules/ingestion/application/commands/job-control.commands.ts';
import { ChapterFetchService } from '../../apps/api/src/modules/ingestion/application/services/chapter-fetch.service.ts';
import { IngestionJobRunnerService } from '../../apps/api/src/modules/ingestion/application/services/ingestion-job-runner.service.ts';
import { IngestionQueueService } from '../../apps/api/src/modules/ingestion/application/services/ingestion-queue.service.ts';
import { SourcePolicyService } from '../../apps/api/src/modules/ingestion/application/services/source-policy.service.ts';
import { IngestionJobEntity } from '../../apps/api/src/modules/ingestion/domain/entities/ingestion-job.entity.ts';
import type {
  IngestionEvent,
  IngestionJob,
  IngestionJobChapter
} from '../../apps/api/src/modules/ingestion/domain/ingestion.models.ts';
import type {
  LibraryChapter,
  LibraryNovelDetail
} from '../../apps/api/src/modules/library/public/library.api.ts';

const now = '2026-07-21T00:00:00.000Z';

function sequenceClock() {
  let second = 0;
  return {
    now() {
      second += 1;
      return new Date(`2026-07-21T00:00:${String(second).padStart(2, '0')}.000Z`);
    }
  };
}

function libraryDetail(chapter: LibraryChapter): LibraryNovelDetail {
  return {
    novel: {
      id: chapter.novelId,
      title: 'Novel',
      sourceUrl: 'https://example.test/novel',
      sourceName: 'Example',
      status: 'analyzed',
      createdAt: now,
      updatedAt: now
    },
    chapters: [chapter]
  };
}

test('runner retries Library delivery with the same command ID after interrupted progress', async () => {
  const chapter: LibraryChapter = {
    id: 'chapter-1',
    novelId: 'novel-1',
    index: 1,
    title: 'Chapter 1',
    sourceUrl: 'https://example.test/novel/1',
    status: 'pending',
    sourceAvailable: true,
    contentVersion: 1,
    createdAt: now,
    updatedAt: now
  };
  let job = IngestionJobEntity.createQueued({
    id: 'job-1',
    novelId: 'novel-1',
    totalChapters: 1,
    now
  }).toPrimitives();
  let work: IngestionJobChapter = {
    jobId: job.id,
    chapterId: chapter.id,
    position: 0,
    status: 'pending',
    attemptCount: 0,
    updatedAt: now
  };
  let failProgressOnce = true;
  const events: IngestionEvent[] = [];
  const repository = {
    findById: async () => job,
    findJobChapters: async () => [work],
    async saveJobWithEvent(next: IngestionJob, event: IngestionEvent) {
      job = next;
      events.push(event);
    },
    async recordChapterResult(
      next: IngestionJob,
      nextWork: IngestionJobChapter,
      event: IngestionEvent
    ) {
      if (failProgressOnce) {
        failProgressOnce = false;
        throw new Error('simulated process stop');
      }
      job = next;
      work = nextWork;
      events.push(event);
    }
  };
  const libraryCommandIds: string[] = [];
  const delivered = new Map<string, LibraryChapter>();
  let libraryWriteCount = 0;
  const runner = new IngestionJobRunnerService({
    repository,
    library: {
      queries: {
        getNovel: async () => libraryDetail(chapter),
        listNovels: async () => {
          throw new Error('not used');
        },
        getChapter: async () => chapter,
        getStats: async () => {
          throw new Error('not used');
        }
      },
      commands: {
        async saveChapterContent(command) {
          libraryCommandIds.push(command.commandId);
          const existing = delivered.get(command.commandId);
          if (existing) return existing;
          libraryWriteCount += 1;
          const saved = {
            ...chapter,
            title: command.title,
            rawText: command.rawText,
            cleanText: command.cleanText,
            status: 'fetched' as const,
            contentVersion: 2,
            updatedAt: command.savedAt
          };
          delivered.set(command.commandId, saved);
          return saved;
        },
        reconcileAnalysis: async () => {
          throw new Error('not used');
        },
        setIngestionState: async () => undefined,
        deleteNovel: async () => {
          throw new Error('not used');
        }
      }
    },
    fetchChapter: {
      execute: async () => ({
        title: 'Chapter 1',
        rawText: 'raw',
        cleanText: 'clean'
      })
    },
    clock: sequenceClock(),
    ids: {
      randomId: (() => {
        let id = 0;
        return () => `event-${++id}`;
      })()
    },
    retry: 0
  });
  const control = {
    isCancelled: () => false,
    isPauseRequested: () => false,
    signal: () => undefined
  };

  await assert.rejects(() => runner.run('job-1', control), /simulated process stop/);
  job = IngestionJobEntity.fromPrimitives(job)
    .markPaused('2026-07-21T00:00:10.000Z')
    .markResuming('2026-07-21T00:00:11.000Z')
    .toPrimitives();
  await runner.run('job-1', control);

  assert.deepEqual(libraryCommandIds, ['chapter:job-1:chapter-1', 'chapter:job-1:chapter-1']);
  assert.equal(libraryWriteCount, 1);
  assert.equal(job.fetchedChapters, 1);
  assert.equal(job.status, 'completed');
  assert.equal(work.status, 'fetched');
  assert.ok(events.some((event) => event.type === 'chapter_succeeded'));
});

test('queue stop aborts active source work and persists a recoverable paused job', async () => {
  let job = IngestionJobEntity.createQueued({
    id: 'job-1',
    novelId: 'novel-1',
    totalChapters: 1,
    now
  }).toPrimitives();
  let observedSignal: AbortSignal | undefined;
  let resolveStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const repository = {
    findById: async () => job,
    async saveJobWithEvent(next: IngestionJob) {
      job = next;
    }
  };
  const runner = {
    async run(_jobId: string, control: { signal(id: string): AbortSignal | undefined }) {
      observedSignal = control.signal('job-1');
      resolveStarted();
      await new Promise<void>((resolve) => {
        observedSignal?.addEventListener('abort', () => resolve(), { once: true });
      });
    },
    async markFailed() {
      throw new Error('must not fail a shutdown pause');
    }
  };
  const queue = new IngestionQueueService({
    repository,
    runner,
    clock: sequenceClock(),
    ids: { randomId: () => 'event-pause' },
    logger: { error() {} }
  });

  queue.enqueue('job-1');
  queue.enqueue('job-1');
  await started;
  await queue.stop();

  assert.equal(observedSignal?.aborted, true);
  assert.equal(job.status, 'paused');
});

test('chapter fetch keeps descriptive titles and removes promotional footer text', async () => {
  const fetch = new ChapterFetchService(
    {
      readMetadata: async () => {
        throw new Error('not used');
      },
      async *streamChapterList() {
        throw new Error('not used');
      },
      readChapterContent: async () => ({
        data: {
          title: 'Chapter',
          url: 'https://example.test/novel/1',
          rawText: 'The dragon woke.\n\n**********\n\nRead more chapters at example.test',
          cleanText: 'The dragon woke.\n\n**********\n\nRead more chapters at example.test'
        },
        source: { pluginId: 'fixture', pluginVersion: '1.0.0', domain: 'example.test' }
      })
    },
    new SourcePolicyService({ check: async () => ({ allowed: true }) })
  );

  const result = await fetch.execute({
    title: 'Chapter 1: The Dragon Wakes',
    sourceUrl: 'https://example.test/novel/1'
  });

  assert.equal(result.title, 'Chapter 1: The Dragon Wakes');
  assert.equal(result.cleanText, 'The dragon woke.');
  assert.match(result.rawText, /Read more chapters/);
});

test('job control commands use durable receipts to avoid repeating queue mutations', async () => {
  const receipts = new Set<string>();
  let pauseCalls = 0;
  const handler = new PauseJobCommandHandler(
    {
      async hasCommandReceipt(commandId, type) {
        return receipts.has(`${type}:${commandId}`);
      },
      async recordCommandReceipt(commandId, type) {
        receipts.add(`${type}:${commandId}`);
      }
    },
    {
      async pause(jobId) {
        assert.equal(jobId, 'job-1');
        pauseCalls += 1;
      }
    }
  );
  const command = { commandId: 'pause-1', jobId: 'job-1', requestedAt: now };

  await handler.execute(command);
  await handler.execute(command);

  assert.equal(pauseCalls, 1);
});
