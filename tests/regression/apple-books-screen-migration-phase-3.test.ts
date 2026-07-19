import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('principal screens compose Apple Books Compact primitives', () => {
  const activity = read('apps/web/src/pages/activity/ui/ActivityPage.tsx');
  const addNovel = read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx');
  const library = read('apps/web/src/pages/library/ui/LibraryPage.tsx');
  const novelCard = read('apps/web/src/entities/novel/ui/NovelLibraryCard.tsx');
  const readerToolbar = read('apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx');
  const readerBottom = read('apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx');

  assert.match(activity, /<Section/);
  assert.match(activity, /<EmptyState/);
  assert.match(addNovel, /<BottomSheet/);
  assert.match(addNovel, /variant="supporting"/);
  assert.match(library, /<Chip/);
  assert.doesNotMatch(library, /<FilterChip/);
  assert.match(novelCard, /padding="none"/);
  assert.match(novelCard, /aspect-\[3\/4\]/);
  assert.match(novelCard, /<Badge/);
  assert.match(novelCard, /<Progress/);
  assert.match(readerToolbar, /<Toolbar/);
  assert.match(readerBottom, /<Text/);
  assert.doesNotMatch(readerToolbar, /text-(xs|sm|base|lg|xl)/);
  assert.doesNotMatch(readerBottom, /text-(xs|sm|base|lg|xl)/);
});

test('migrated screen chrome uses canonical icon scale', () => {
  const files = [
    'apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx',
    'apps/web/src/widgets/reader-bottom-bar/ui/ReaderBottomBar.tsx'
  ]
    .map(read)
    .join('\n');
  assert.doesNotMatch(files, /size=\{(?:13|14|15|17|19|21|22|23|26|27)\}/);
});
