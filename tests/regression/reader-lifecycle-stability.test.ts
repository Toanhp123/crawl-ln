import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Chapter } from '@novel-tool/shared';
import {
  appendReaderChapter,
  createReaderWindow,
  prependReaderChapter
} from '../../apps/web/src/modules/reader/domain/reader-window.ts';

const read = (path: string) => readFileSync(path, 'utf8');

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
    contentVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

test('reader window never evicts the active chapter during rapid prepend and append', () => {
  let window = createReaderWindow(chapter(12), 12);
  for (const index of [11, 10, 9, 8, 7, 6])
    window = prependReaderChapter(window, chapter(index), 12, 5);
  assert.equal(
    window.chapters.some((item) => item.index === 12),
    true
  );

  for (const index of [13, 14, 15, 16, 17, 18])
    window = appendReaderChapter(window, chapter(index), 12, 5);
  assert.equal(
    window.chapters.some((item) => item.index === 12),
    true
  );
  assert.ok(window.chapters.length <= 5);
});

test('reader async state is scoped to a generation and cancelled when leaving', () => {
  const hook = read('apps/web/src/modules/reader/presentation/use-infinite-reader.ts');
  assert.match(hook, /session\.current !== currentSession/);
  assert.match(hook, /mounted\.current/);
  assert.match(hook, /cancelSession/);
  assert.match(hook, /loadingNextRef/);
  assert.match(hook, /loadingPreviousRef/);
  assert.doesNotMatch(hook, /\[novelId, initialIndex, fetched,/);
});

test('reader observers are interactive-only and consume one load permission per gesture', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(page, /scrollPhase\.current !== 'interactive'/);
  assert.match(page, /allowPreviousLoad\.current = false/);
  assert.match(page, /allowNextLoad\.current = false/);
  assert.match(page, /readerSession\.current !== currentSession/);
  assert.match(page, /stream\.cancelSession\(\)/);
  assert.match(page, /readerRoot\.current\?\.querySelectorAll/);
});
