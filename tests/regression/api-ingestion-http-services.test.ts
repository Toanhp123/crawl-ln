import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AnalyzeSourcePreviewService } from '../../apps/api/src/modules/ingestion/application/services/analyze-source-preview.service.ts';
import { RefreshNovelSummaryService } from '../../apps/api/src/modules/ingestion/application/services/refresh-novel-summary.service.ts';
import { ResumePausedJobsService } from '../../apps/api/src/modules/ingestion/application/services/resume-paused-jobs.service.ts';
import type { IngestionJob } from '../../apps/api/src/modules/ingestion/public/ingestion.api.ts';

const now = '2026-07-21T13:00:00.000Z';

function interfaceBody(path: string, name: string): string {
  const source = readFileSync(path, 'utf8');
  const match = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  assert.ok(match, `${name} must exist in ${path}`);
  return match[1];
}

function job(id: string, status: IngestionJob['status'] = 'paused'): IngestionJob {
  return {
    id,
    novelId: 'novel-1',
    status,
    totalChapters: 2,
    fetchedChapters: 0,
    failedChapters: 0,
    totalPausedMs: 0,
    currentSpeed: 0,
    averageSpeed: 0,
    createdAt: now,
    updatedAt: now
  };
}

test('HTTP-only query options do not expand immutable Library and Ingestion APIs', () => {
  const libraryQuery = interfaceBody(
    'apps/api/src/modules/library/domain/library.contracts.ts',
    'ListLibraryNovelsQuery'
  );
  const ingestionQueries = interfaceBody(
    'apps/api/src/modules/ingestion/public/ingestion.contracts.ts',
    'IngestionQueries'
  );

  assert.match(libraryQuery, /status\?: 'all' \| 'active' \| LibraryNovelStatus;/);
  assert.doesNotMatch(libraryQuery, /'importing'/);
  assert.match(ingestionQueries, /getJobEvents\(id: string\): Promise<IngestionEvent\[\]>;/);
  assert.doesNotMatch(ingestionQueries, /getJobEvents\([^)]*limit/);
});

test('source preview returns current analyze diagnostics without persisting Library data', async () => {
  const trace: string[] = [];
  const service = new AnalyzeSourcePreviewService(
    {
      async readMetadata() {
        return {
          data: {
            title: 'Preview Novel',
            sourceUrl: 'https://fixture.test/novel',
            sourceName: 'fixture',
            description: 'Description'
          },
          source: { pluginId: 'fixture', pluginVersion: '1.0.0', domain: 'fixture.test' }
        };
      },
      async *streamChapterList() {
        yield {
          data: [
            { index: 1, title: 'One', url: 'https://fixture.test/novel/1' },
            { index: 2, title: 'Two', url: 'https://fixture.test/novel/2' }
          ],
          source: { pluginId: 'fixture', pluginVersion: '1.0.0', domain: 'fixture.test' }
        };
      },
      async readChapterContent() {
        throw new Error('not used');
      }
    },
    {
      assertChapterHosts() {
        trace.push('policy.chapters');
      }
    } as never
  );

  const result = await service.execute({ url: 'https://fixture.test/novel' });
  assert.equal(result.title, 'Preview Novel');
  assert.equal(result.description, 'Description');
  assert.deepEqual(result.diagnostics, {
    chapterCount: 2,
    firstChapterUrls: ['https://fixture.test/novel/1', 'https://fixture.test/novel/2']
  });
  assert.deepEqual(trace, ['policy.chapters']);
});

test('refresh summary computes chapter delta outside HTTP presentation', async () => {
  let refreshed = false;
  const library = {
    async getNovel() {
      return {
        novel: {
          id: 'novel-1',
          title: 'Novel',
          sourceUrl: 'https://fixture.test/novel',
          sourceName: 'fixture',
          status: 'completed' as const,
          createdAt: now,
          updatedAt: now
        },
        chapters: [
          {
            id: 'chapter-1',
            novelId: 'novel-1',
            index: 1,
            title: 'One',
            sourceUrl: 'https://fixture.test/novel/1',
            status: 'fetched' as const,
            sourceAvailable: true,
            contentVersion: 1,
            createdAt: now,
            updatedAt: now
          },
          ...(refreshed
            ? [
                {
                  id: 'chapter-2',
                  novelId: 'novel-1',
                  index: 2,
                  title: 'Two',
                  sourceUrl: 'https://fixture.test/novel/2',
                  status: 'pending' as const,
                  sourceAvailable: true,
                  contentVersion: 1,
                  createdAt: now,
                  updatedAt: now
                }
              ]
            : [])
        ]
      };
    }
  };
  const service = new RefreshNovelSummaryService(library, {
    async execute() {
      refreshed = true;
      return job('task-1', 'queued');
    }
  });

  const result = await service.execute({
    commandId: 'refresh-1',
    novelId: 'novel-1',
    requestedAt: now
  });
  assert.equal(result.newChapterCount, 1);
  assert.equal(result.pendingChapterCount, 2);
  assert.equal(result.task?.id, 'task-1');
  assert.equal(result.novel.chapters.length, 2);
});

test('bulk resume orchestration derives stable child command IDs', async () => {
  const calls: unknown[] = [];
  const jobs = new Map([
    ['task-1', job('task-1')],
    ['task-2', job('task-2')]
  ]);
  const service = new ResumePausedJobsService(
    {
      listJobs: async () => [...jobs.values()],
      getJob: async (id: string) => jobs.get(id) ?? null
    },
    {
      async execute(command) {
        calls.push(command);
        jobs.set(command.jobId, job(command.jobId, 'queued'));
      }
    }
  );

  const result = await service.execute({
    commandId: 'resume-all',
    limit: 20,
    requestedAt: now
  });
  assert.deepEqual(
    result.map((item) => item.status),
    ['queued', 'queued']
  );
  assert.deepEqual(calls, [
    { commandId: 'resume-all:task-1', jobId: 'task-1', requestedAt: now },
    { commandId: 'resume-all:task-2', jobId: 'task-2', requestedAt: now }
  ]);
});
