import test from 'node:test';
import assert from 'node:assert/strict';
import type { Chapter } from '@novel-tool/shared';
import {
  appendReaderChapter,
  createReaderWindow,
  prependReaderChapter
} from '../../apps/web-legacy/src/modules/reader/domain/reader-window.ts';
import {
  MemoryReaderChapterCache,
  ReaderChapterSource
} from '../../apps/web-legacy/src/modules/reader/application/reader-chapter-source.ts';

function chapter(index: number): Chapter {
  return {
    id: `chapter-${index}`,
    novelId: 'novel-1',
    index,
    title: `Chapter ${index}`,
    url: `https://example.com/${index}`,
    status: 'fetched',
    rawHtml: null,
    cleanText: `Content ${index}`,
    retryCount: 0,
    lastError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

test('reader window appends, prepends, deduplicates, and evicts chapters farthest from active', () => {
  let window = createReaderWindow(chapter(3), 3);
  window = appendReaderChapter(window, chapter(4), 3, 3);
  window = appendReaderChapter(window, chapter(5), 3, 3);
  window = appendReaderChapter(window, chapter(5), 3, 3);
  assert.deepEqual(
    window.chapters.map((item) => item.index),
    [3, 4, 5]
  );

  window = prependReaderChapter(window, chapter(2), 4, 3);
  assert.deepEqual(
    window.chapters.map((item) => item.index),
    [3, 4, 5]
  );
});

test('reader chapter source uses memory cache before loader and keeps a bounded LRU', async () => {
  let calls = 0;
  const cache = new MemoryReaderChapterCache(2);
  const source = new ReaderChapterSource(cache, async (_novelId, index) => {
    calls += 1;
    return chapter(index);
  });

  await source.load('novel-1', { id: 'chapter-1', index: 1 });
  await source.load('novel-1', { id: 'chapter-1', index: 1 });
  await source.load('novel-1', { id: 'chapter-2', index: 2 });
  await source.load('novel-1', { id: 'chapter-3', index: 3 });

  assert.equal(calls, 3);
  assert.equal(await cache.get('novel-1', 'chapter-1'), null);
  assert.equal((await cache.get('novel-1', 'chapter-2'))?.index, 2);
  assert.equal((await cache.get('novel-1', 'chapter-3'))?.index, 3);
});

test('reader page delegates infinite loading and offline cache to the reader module', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(
    new URL(
      '../../apps/web-legacy/src/pages/chapter-reader/ui/ChapterReaderPage.tsx',
      import.meta.url
    ),
    'utf8'
  );
  const hook = await readFile(
    new URL(
      '../../apps/web-legacy/src/modules/reader/presentation/use-infinite-reader.ts',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(page, /useInfiniteReader/);
  assert.match(page, /IntersectionObserver/);
  assert.match(page, /stream\.loadNext/);
  assert.match(page, /stream\.loadPrevious/);
  assert.match(hook, /IndexedDbReaderChapterCache/);
  assert.match(hook, /WINDOW_LIMIT = 5/);
});

test('reader cache follows chapter id when chapter indexes shift', async () => {
  let calls = 0;
  const cache = new MemoryReaderChapterCache(4);
  const source = new ReaderChapterSource(cache, async (_novelId, index) => {
    calls += 1;
    return { ...chapter(index), id: index === 10 ? 'chapter-x' : 'chapter-a' };
  });

  await cache.set('novel-1', { ...chapter(10), id: 'chapter-a', cleanText: 'Content A' });
  const inserted = await source.load('novel-1', { id: 'chapter-x', index: 10 });
  const shifted = await source.load('novel-1', { id: 'chapter-a', index: 11 });

  assert.equal(inserted.id, 'chapter-x');
  assert.equal(shifted.id, 'chapter-a');
  assert.equal(shifted.cleanText, 'Content A');
  assert.equal(calls, 1);
});

test('reader rejects a chapter loaded for a stale index when ids do not match', async () => {
  const source = new ReaderChapterSource(new MemoryReaderChapterCache(), async () => ({
    ...chapter(10),
    id: 'chapter-x',
    contentVersion: 1
  }));

  await assert.rejects(
    () => source.load('novel-1', { id: 'chapter-a', index: 10, contentVersion: 1 }),
    /chapter list is stale/i
  );
});
