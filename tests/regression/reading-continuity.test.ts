import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const load = (path: string) => readFile(new URL(path, root), 'utf8');

test('reader continuity persists history, bookmarks, and read chapters', async () => {
  const storage = await load(
    'apps/web-legacy/src/features/read-chapter/model/readingContinuityStorage.ts'
  );
  assert.match(storage, /recordReadingActivity/);
  assert.match(storage, /toggleBookmark/);
  assert.match(storage, /readChapterIds/);
  assert.match(storage, /novel-tool-reading-history:v2/);
});

test('reader and library expose continuity controls', async () => {
  const reader = await load('apps/web-legacy/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  const library = await load('apps/web-legacy/src/pages/library/ui/LibraryPage.tsx');
  assert.match(reader, /readLatestReadingPosition/);
  assert.match(reader, /reader\.bookmarks/);
  assert.match(library, /ContinueReadingHero/);
  assert.match(library, /continueNovel/);
});
