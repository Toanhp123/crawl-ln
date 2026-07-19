import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('reader is a nested overlay that keeps novel detail mounted', () => {
  const router = read('apps/web/src/app/router/AppRouter.tsx');
  const detailRoute = read('apps/web/src/pages/novel-detail/ui/NovelDetailRoute.tsx');
  const readerShell = read('apps/web/src/app/layouts/ReaderShell.tsx');

  assert.match(router, /path="\/library\/:novelId" element=\{<NovelDetailRoute \/>\}/);
  assert.match(router, /path="read\/:chapterIndex" element=\{<ChapterReaderPage \/>\}/);
  assert.doesNotMatch(router, /path="\/reader\/:novelId\/:chapterIndex"/);
  assert.match(detailRoute, /<NovelDetailPage \/>/);
  assert.match(detailRoute, /<Outlet \/>/);
  assert.match(readerShell, /createPortal/);
  assert.match(readerShell, /fixed inset-0/);
});

test('reader navigation preserves the parent scroll entry and removes legacy return restoration', () => {
  const detailModel = read('apps/web/src/pages/novel-detail/model/useNovelDetailPage.ts');
  const readerModel = read('apps/web/src/pages/chapter-reader/model/useChapterReaderPage.ts');
  const viewport = read('apps/web/src/app/layouts/AppScrollViewport.tsx');
  const detailPage = read('apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  const chapterList = read('apps/web/src/entities/chapter/ui/ChapterList.tsx');

  assert.match(detailModel, /\/library\/\$\{encodeURIComponent\(novelId\)\}\/read\/\$\{index\}/);
  assert.match(detailModel, /readerNavigationState\(location\.key\)/);
  assert.match(readerModel, /navigate\(-1\)/);
  assert.match(viewport, /readBackgroundScrollKey/);
  assert.doesNotMatch(detailPage, /readRestoreChapterIndex|restoreIndex=/);
  assert.doesNotMatch(chapterList, /restoreIndex|scrollIntoView/);
  assert.equal(existsSync('apps/web/src/shared/navigation/readerReturnState.ts'), true);
});

test('all internal reader links use the nested library route', () => {
  const files = [
    'apps/web/src/features/search-library/ui/LibraryContentSearch.tsx',
    'apps/web/src/pages/library/model/useLibraryPage.ts',
    'apps/web/src/pages/novel-detail/model/useNovelDetailPage.ts',
    'apps/web/src/pages/chapter-reader/model/useChapterReaderPage.ts',
    'apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx'
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /`?\/reader\//, file);
  }
});
