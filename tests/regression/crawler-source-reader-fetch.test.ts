import assert from 'node:assert/strict';
import test from 'node:test';
import { FetchChapterUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/fetch-chapter.usecase.ts';

const calls: string[] = [];
const robots = { check: async () => ({ allowed: true, crawlDelayMs: 25 }) };
const limiter = { wait: async (host: string, delay?: number) => calls.push(`${host}:${delay}`) };
const reader = {
  readChapterContent: async ({ url }: { url: string }) => ({
    data: { title: 'Chapter', url, rawText: 'raw', cleanText: 'clean' },
    source: {
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      domain: 'example.test',
      capability: 'chapter-content' as const
    }
  })
};

test.beforeEach(() => {
  calls.length = 0;
});

test('crawler keeps robots and pacing around Source Reader chapter fetch', async () => {
  const result = await new FetchChapterUseCase(reader as never, robots, limiter).execute(
    'https://example.test/chapter/1'
  );

  assert.equal(result.cleanText, 'clean');
  assert.deepEqual(calls, ['example.test:25']);
});
