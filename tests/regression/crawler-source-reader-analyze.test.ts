import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyzeSourceUseCase } from '../../apps/api/src/modules/crawler/application/use-cases/analyze-source.usecase.ts';

const robots = { check: async () => ({ allowed: true, crawlDelayMs: 0 }) };
const reader = {
  readMetadata: async ({ url }: { url: string }) => ({
    data: {
      title: 'Reader Novel',
      sourceUrl: url,
      sourceName: 'Reader Plugin',
      author: 'Author'
    },
    source: {
      pluginId: 'reader-plugin',
      pluginVersion: '1.0.0',
      domain: 'example.test',
      capability: 'metadata' as const
    }
  }),
  async *streamChapterList({ url }: { url: string }) {
    yield {
      data: [
        { index: 1, title: 'Chapter 1', url: `${url}/chapter/1` },
        { index: 2, title: 'Chapter 2', url: `${url}/chapter/2` }
      ],
      source: {
        pluginId: 'reader-plugin',
        pluginVersion: '1.0.0',
        domain: 'example.test',
        capability: 'chapter-list' as const
      }
    };
  }
};

test('crawler analyze composes metadata and chapter stream from Source Reader', async () => {
  const result = await new AnalyzeSourceUseCase(reader as never, robots).execute(
    'https://example.test/book'
  );
  assert.equal(result.title, 'Reader Novel');
  assert.equal(result.sourceName, 'Reader Plugin');
  assert.deepEqual(
    result.chapters.map((chapter) => chapter.index),
    [1, 2]
  );
  assert.equal(result.diagnostics?.chapterCount, 2);
});
