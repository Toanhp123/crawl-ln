import assert from 'node:assert/strict';
import test from 'node:test';
import { IngestionSourcePluginUsageQueryService } from '../../apps/api/src/modules/ingestion/application/queries/source-plugin-usage.query.ts';

const jobs = {
  queued: { id: 'queued', novelId: 'novel-1', status: 'queued' },
  running: { id: 'running', novelId: 'novel-1', status: 'running' },
  pausing: { id: 'pausing', novelId: 'novel-1', status: 'pausing' },
  paused: { id: 'paused', novelId: 'novel-1', status: 'paused' },
  resuming: { id: 'resuming', novelId: 'novel-1', status: 'resuming' }
} as const;

function service(captured: string[][]) {
  return new IngestionSourcePluginUsageQueryService(
    {
      findAllByStatuses: async (statuses) => {
        captured.push([...statuses]);
        return statuses.map((status) => jobs[status as keyof typeof jobs]) as never;
      },
      findJobChapters: async (jobId) => [
        {
          jobId,
          chapterId: 'chapter-1',
          position: 0,
          status: 'pending',
          attemptCount: 0,
          updatedAt: '2026-07-27T00:00:00.000Z'
        }
      ]
    },
    {
      getNovel: async () => ({
        novel: {
          id: 'novel-1',
          title: 'Novel',
          sourceUrl: 'https://novelcool.com/novel/book/1',
          sourceName: 'NovelCool',
          status: 'crawling',
          createdAt: '2026-07-27T00:00:00.000Z',
          updatedAt: '2026-07-27T00:00:00.000Z'
        },
        chapters: [
          {
            id: 'chapter-1',
            novelId: 'novel-1',
            index: 1,
            title: 'Chapter 1',
            sourceUrl: 'https://novelcool.com/chapter/Chapter-1/1001/',
            status: 'pending',
            sourceAvailable: true,
            contentVersion: 0,
            createdAt: '2026-07-27T00:00:00.000Z',
            updatedAt: '2026-07-27T00:00:00.000Z'
          }
        ]
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
    }
  );
}

test('disable usage excludes paused jobs while deny and remove usage include them', async () => {
  const captured: string[][] = [];
  const query = service(captured);

  const disable = await query.listPotentialUsages('disable');
  const deny = await query.listPotentialUsages('deny');
  const remove = await query.listPotentialUsages('remove');

  assert.deepEqual(captured[0], ['queued', 'running', 'pausing', 'resuming']);
  assert.deepEqual(captured[1], ['queued', 'running', 'pausing', 'paused', 'resuming']);
  assert.deepEqual(captured[2], ['queued', 'running', 'pausing', 'paused', 'resuming']);
  assert.equal(
    disable.some((usage) => usage.status === 'paused'),
    false
  );
  assert.equal(
    deny.some((usage) => usage.status === 'paused'),
    true
  );
  assert.equal(
    remove.some((usage) => usage.status === 'paused'),
    true
  );
});

test('usage query returns the exact planned chapter source URLs for each job', async () => {
  const query = service([]);
  const [usage] = await query.listPotentialUsages('disable');

  assert.deepEqual(usage.sourceUrls, ['https://novelcool.com/chapter/Chapter-1/1001/']);
});
