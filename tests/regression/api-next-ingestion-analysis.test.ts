import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateIngestionJobCommandHandler } from '../../apps/api-next/src/modules/ingestion/application/commands/create-ingestion-job.command.ts';
import type { IngestionSourceReaderPort } from '../../apps/api-next/src/modules/ingestion/application/ports/source-reader.port.ts';
import { AnalyzeNovelWorkflow } from '../../apps/api-next/src/modules/ingestion/application/services/analyze-novel.workflow.ts';
import { SourcePolicyService } from '../../apps/api-next/src/modules/ingestion/application/services/source-policy.service.ts';
import { RefreshNovelWorkflow } from '../../apps/api-next/src/modules/ingestion/application/services/refresh-novel.workflow.ts';
import { IngestionJobEntity } from '../../apps/api-next/src/modules/ingestion/domain/entities/ingestion-job.entity.ts';
import { IngestionError } from '../../apps/api-next/src/modules/ingestion/domain/errors/ingestion.error.ts';
import type { LibraryNovelDetail } from '../../apps/api-next/src/modules/library/public/library.api.ts';

const now = '2026-07-21T00:00:00.000Z';
const sourceUrl = 'https://www.example.test/book?ref=input';
const normalizedUrl = 'https://example.test/book';

function createAnalysisScenario(
  options: {
    offHostChapter?: boolean;
    noChapters?: boolean;
    robotsAllowed?: boolean;
  } = {}
) {
  const calls: string[] = [];
  const reconciled: unknown[] = [];
  const generatedIds = ['novel-generated', 'chapter-generated-1', 'chapter-generated-2'];
  const sourceReader: IngestionSourceReaderPort = {
    async readMetadata() {
      calls.push('source.metadata');
      return {
        data: {
          title: 'Novel',
          sourceUrl: normalizedUrl,
          sourceName: 'Example',
          author: 'Author'
        },
        source: { pluginId: 'fixture', pluginVersion: '1.0.0', domain: 'example.test' }
      };
    },
    async *streamChapterList() {
      calls.push('source.chapters');
      if (options.noChapters) return;
      yield {
        data: [
          { index: 1, title: 'Chapter 1', url: `${normalizedUrl}/1` },
          {
            index: 2,
            title: 'Chapter 2',
            url: options.offHostChapter ? 'https://evil.test/chapter/2' : `${normalizedUrl}/2`
          }
        ],
        source: { pluginId: 'fixture', pluginVersion: '1.0.0', domain: 'example.test' }
      };
    },
    async readChapterContent() {
      throw new Error('not used');
    }
  };
  const policy = new SourcePolicyService({
    async check() {
      calls.push('robots.check');
      return {
        allowed: options.robotsAllowed ?? true,
        ...(options.robotsAllowed === false ? { reason: 'blocked by robots' } : {})
      };
    }
  });
  const workflow = new AnalyzeNovelWorkflow(
    sourceReader,
    policy,
    {
      async reconcileAnalysis(command) {
        calls.push('library.reconcile');
        reconciled.push(command);
        return {
          novel: {
            ...command.novel,
            status: 'analyzed',
            createdAt: command.analyzedAt,
            updatedAt: command.analyzedAt
          },
          chapters: command.chapters.map((chapter) => ({
            ...chapter,
            novelId: command.novel.id,
            status: 'pending',
            sourceAvailable: true,
            contentVersion: 1,
            createdAt: command.analyzedAt,
            updatedAt: command.analyzedAt
          }))
        };
      },
      async saveChapterContent() {
        throw new Error('not used');
      },
      async setIngestionState() {
        throw new Error('not used');
      },
      async deleteNovel() {
        throw new Error('not used');
      }
    },
    { randomId: () => generatedIds.shift() ?? 'unexpected-id' }
  );
  return { calls, reconciled, workflow };
}

test('analysis reads source data then reconciles it through Library public commands', async () => {
  const scenario = createAnalysisScenario();
  const result = await scenario.workflow.execute({
    commandId: 'analysis-1',
    url: sourceUrl,
    requestedAt: now
  });

  assert.deepEqual(scenario.calls, [
    'robots.check',
    'source.metadata',
    'source.chapters',
    'library.reconcile'
  ]);
  assert.equal(result.novel.sourceUrl, normalizedUrl);
  assert.deepEqual(
    scenario.reconciled[0] as { novel: { id: string }; chapters: Array<{ id: string }> },
    {
      commandId: 'analysis-1',
      analyzedAt: now,
      novel: {
        id: 'novel-generated',
        title: 'Novel',
        sourceUrl: normalizedUrl,
        sourceName: 'Example',
        author: 'Author',
        coverUrl: undefined
      },
      chapters: [
        {
          id: 'chapter-generated-1',
          index: 1,
          title: 'Chapter 1',
          sourceUrl: `${normalizedUrl}/1`
        },
        {
          id: 'chapter-generated-2',
          index: 2,
          title: 'Chapter 2',
          sourceUrl: `${normalizedUrl}/2`
        }
      ]
    }
  );
});

test('analysis rejects denied, empty and off-host source results before Library writes', async () => {
  for (const scenario of [
    createAnalysisScenario({ robotsAllowed: false }),
    createAnalysisScenario({ noChapters: true }),
    createAnalysisScenario({ offHostChapter: true })
  ]) {
    await assert.rejects(
      () =>
        scenario.workflow.execute({
          commandId: 'analysis-invalid',
          url: sourceUrl,
          requestedAt: now
        }),
      (error: unknown) => error instanceof IngestionError
    );
    assert.equal(scenario.calls.includes('library.reconcile'), false);
  }
});

test('create job selects pending source chapters and enqueues only a newly committed job', async () => {
  const calls: string[] = [];
  const detail: LibraryNovelDetail = {
    novel: {
      id: 'novel-1',
      title: 'Novel',
      sourceUrl: normalizedUrl,
      sourceName: 'Example',
      status: 'analyzed',
      createdAt: now,
      updatedAt: now
    },
    chapters: [
      {
        id: 'pending',
        novelId: 'novel-1',
        index: 1,
        title: 'Pending',
        sourceUrl: `${normalizedUrl}/1`,
        status: 'pending',
        sourceAvailable: true,
        contentVersion: 1,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'fetched',
        novelId: 'novel-1',
        index: 2,
        title: 'Fetched',
        sourceUrl: `${normalizedUrl}/2`,
        status: 'fetched',
        sourceAvailable: true,
        contentVersion: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'unavailable',
        novelId: 'novel-1',
        index: 3,
        title: 'Unavailable',
        sourceUrl: `${normalizedUrl}/3`,
        status: 'failed',
        sourceAvailable: false,
        contentVersion: 1,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
  let createCalls = 0;
  const handler = new CreateIngestionJobCommandHandler(
    {
      async getNovel() {
        calls.push('library.get');
        return detail;
      },
      async listNovels() {
        throw new Error('not used');
      },
      async getChapter() {
        throw new Error('not used');
      },
      async getStats() {
        throw new Error('not used');
      }
    },
    {
      async createForCommand(_commandId, job, chapterIds) {
        calls.push('repository.create');
        createCalls += 1;
        assert.deepEqual(chapterIds, ['pending']);
        return { job, created: createCalls === 1 };
      }
    },
    {
      async enqueue(jobId) {
        calls.push(`queue.enqueue:${jobId}`);
      }
    },
    { randomId: () => 'job-1' }
  );
  const command = { commandId: 'create-1', novelId: 'novel-1', requestedAt: now };

  const first = await handler.execute(command);
  const repeated = await handler.execute(command);

  assert.equal(first.totalChapters, 1);
  assert.deepEqual(repeated, first);
  assert.deepEqual(calls, [
    'library.get',
    'repository.create',
    'queue.enqueue:job-1',
    'library.get',
    'repository.create'
  ]);
});

test('create job rejects a missing novel or a novel without pending source chapters', async () => {
  const createHandler = (novel: LibraryNovelDetail | null) =>
    new CreateIngestionJobCommandHandler(
      {
        getNovel: async () => novel,
        listNovels: async () => {
          throw new Error('not used');
        },
        getChapter: async () => {
          throw new Error('not used');
        },
        getStats: async () => {
          throw new Error('not used');
        }
      },
      { createForCommand: async () => Promise.reject(new Error('must not create')) },
      { enqueue: async () => undefined },
      { randomId: () => 'job-1' }
    );
  const noPending: LibraryNovelDetail = {
    novel: {
      id: 'novel-1',
      title: 'Novel',
      sourceUrl: normalizedUrl,
      sourceName: 'Example',
      status: 'completed',
      createdAt: now,
      updatedAt: now
    },
    chapters: []
  };

  await assert.rejects(
    () => createHandler(null).execute({ commandId: 'one', novelId: 'missing', requestedAt: now }),
    (error: unknown) => error instanceof IngestionError && error.code === 'INGESTION_NOT_FOUND'
  );
  await assert.rejects(
    () =>
      createHandler(noPending).execute({
        commandId: 'two',
        novelId: 'novel-1',
        requestedAt: now
      }),
    (error: unknown) => error instanceof IngestionError && error.code === 'INGESTION_CONFLICT'
  );
});

test('refresh novel reanalyzes its source and creates a job with derived command IDs', async () => {
  const calls: unknown[] = [];
  const workflow = new RefreshNovelWorkflow(
    {
      getNovel: async () => ({
        novel: {
          id: 'novel-1',
          title: 'Novel',
          sourceUrl: normalizedUrl,
          sourceName: 'Example',
          status: 'completed',
          createdAt: now,
          updatedAt: now
        },
        chapters: []
      }),
      listNovels: async () => {
        throw new Error('not used');
      },
      getChapter: async () => {
        throw new Error('not used');
      },
      getStats: async () => {
        throw new Error('not used');
      }
    },
    {
      async execute(command) {
        calls.push(command);
        return {} as never;
      }
    },
    {
      async execute(command) {
        calls.push(command);
        return IngestionJobEntity.createQueued({
          id: 'job-1',
          novelId: command.novelId,
          totalChapters: 1,
          now: command.requestedAt
        }).toPrimitives();
      }
    }
  );

  const result = await workflow.execute({
    commandId: 'refresh-1',
    novelId: 'novel-1',
    requestedAt: now
  });

  assert.equal(result?.id, 'job-1');
  assert.deepEqual(calls, [
    { commandId: 'refresh-1:analysis', url: normalizedUrl, requestedAt: now },
    { commandId: 'refresh-1:job', novelId: 'novel-1', requestedAt: now }
  ]);
});
