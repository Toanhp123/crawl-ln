import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('library phase 3 uses card-first reading and import actions', async () => {
  const [page, card, grid] = await Promise.all([
    read('apps/web/src/pages/library/ui/LibraryPage.tsx'),
    read('apps/web/src/entities/novel/ui/NovelLibraryCard.tsx'),
    read('apps/web/src/widgets/library-grid/ui/LibraryGrid.tsx')
  ]);
  assert.match(page, /ContinueReadingHero/);
  assert.match(page, /activeFilterChips/);
  assert.match(card, /fetchedChapterCount/);
  assert.match(card, /readingProgress/);
  assert.match(card, /onContinueImport/);
  assert.match(grid, /NovelLibraryCard/);
});

test('library phase 3 distinguishes empty search and filter states', async () => {
  const page = await read('apps/web/src/pages/library/ui/LibraryPage.tsx');
  assert.match(page, /library\.empty\.initial/);
  assert.match(page, /library\.empty\.search/);
  assert.match(page, /library\.empty\.filter/);
  assert.match(page, /clearFilters/);
  assert.match(page, /addNovel\.open/);
});

test('novel list read model exposes chapter progress fields', async () => {
  const [shared, repository] = await Promise.all([
    read('packages/shared/src/index.ts'),
    read('apps/api/src/modules/novels/infrastructure/sqlite/novel-sqlite.repository.ts')
  ]);
  assert.match(shared, /chapterCount\?: number/);
  assert.match(shared, /fetchedChapterCount\?: number/);
  assert.match(repository, /chapter_count/);
  assert.match(repository, /fetched_chapter_count/);
});
