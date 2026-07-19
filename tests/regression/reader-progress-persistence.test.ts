import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('reader progress targets the active rendered chapter instead of a missing id', async () => {
  const progress = await read('apps/web/src/features/read-chapter/model/useReaderProgress.ts');
  assert.match(progress, /data-reader-chapter/);
  assert.doesNotMatch(progress, /reader-chapter-content/);
  assert.match(progress, /overallRatio/);
});

test('reader saves chapter and whole-book progress with stable chapter identity', async () => {
  const [page, storage] = await Promise.all([
    read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx'),
    read('apps/web/src/features/read-chapter/model/readingPositionStorage.ts')
  ]);
  assert.match(page, /bookProgress: currentProgress\.overallRatio/);
  assert.match(page, /scrollRatio: currentProgress\.chapterRatio/);
  assert.match(page, /!activeChapter\?\.id[\s\S]*activePosition < 0/);
  assert.match(storage, /bookProgress\?: number/);
  assert.match(storage, /chapterPosition\?: number/);
});

test('reader top chrome is fixed as one unit with the toolbar and progress', async () => {
  const [page, toolbar] = await Promise.all([
    read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx'),
    read('apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx')
  ]);
  assert.match(page, /fixed inset-x-0 top-0 z-\[var\(--z-nav\)\]/);
  assert.doesNotMatch(toolbar, /safe-top fixed/);
});

test('library uses summary counters without per-novel detail fan-out', async () => {
  const page = await read('apps/web/src/pages/library/model/useLibraryPage.ts');
  assert.match(page, /const items = novels\.data\?\.items \?\? \[\]/);
  assert.doesNotMatch(page, /useQueries/);
  assert.doesNotMatch(page, /detailFallbacks/);
});
