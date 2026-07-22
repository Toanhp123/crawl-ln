import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

async function readTree(directory: string, root = directory): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target, root));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

test('novel detail page composes public reads actions and continuity without owning transport', async () => {
  const source = await readTree('apps/web/src/pages/novel-detail');
  assert.match(source, /useNovel\(/);
  assert.match(source, /useNovelTask\(/);
  assert.match(source, /useUpdateNovel\(/);
  assert.match(source, /useCrawlNovel\(/);
  assert.match(source, /useDeleteNovel\(/);
  assert.match(source, /AutoUpdateControl/);
  assert.match(source, /ExportNovelControl/);
  assert.match(source, /readLatestReadingPosition/);
  assert.match(source, /useScrollRestoration/);
  assert.doesNotMatch(source, /useQuery\(|useMutation\(|\bhttp\s*\(|fetch\s*\(/);
});

test('novel detail preserves management chapter error and last-position behavior', async () => {
  const source = await readTree('apps/web/src/pages/novel-detail');
  assert.match(source, /NovelManagementSheet/);
  assert.match(source, /ChapterList/);
  assert.match(source, /TaskProgress/);
  assert.match(source, /errorMessage/);
  assert.match(source, /latestPosition/);
  assert.match(source, /bookmarks/);
  assert.match(source, /readChapterIds/);
  assert.match(source, /ConfirmDialog/);
});

test('reader page delegates persistence and bounded loading to reader features', async () => {
  const source = await readTree('apps/web/src/pages/chapter-reader');
  assert.match(source, /useReaderController/);
  assert.match(source, /useReaderProgress/);
  assert.match(source, /readReadingPosition/);
  assert.match(source, /saveReadingPosition/);
  assert.match(source, /ReaderPreferencesSheet/);
  assert.match(source, /ChapterListSheet/);
  assert.doesNotMatch(source, /indexedDB|localStorage|createReaderSession|trimAroundActive/);
});

test('reader page renders at most the controller window and wires route synchronization', async () => {
  const source = await readTree('apps/web/src/pages/chapter-reader');
  assert.match(source, /windowLimit:\s*5/);
  assert.match(source, /controller\.chapters\.map/);
  assert.match(source, /onActiveIndexChange/);
  assert.match(source, /replace:\s*true/);
  assert.match(source, /data-reader-chapter/);
});

test('reader preserves scroll anchoring navigation wake lock and auto-hiding chrome', async () => {
  const source = await readTree('apps/web/src/pages/chapter-reader');
  assert.match(source, /captureReadingAnchor/);
  assert.match(source, /restoreReadingAnchor/);
  assert.match(source, /useSwipeChapterNavigation/);
  assert.match(source, /useReaderWakeLock/);
  assert.match(source, /scheduleChromeHide/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /ArrowLeft|navigatePrevious/);
  assert.match(source, /ArrowRight|navigateNext/);
});

test('reader widgets are presentation-only public slices', async () => {
  for (const directory of [
    'apps/web/src/widgets/reader-toolbar',
    'apps/web/src/widgets/reader-progress',
    'apps/web/src/widgets/reader-bottom-bar'
  ]) {
    assert.match(await readFile(`${directory}/index.ts`, 'utf8'), /export/);
    const source = await readTree(directory);
    assert.doesNotMatch(source, /useQuery\(|useMutation\(|\bhttp\s*\(|fetch\s*\(/);
  }
});

test('reader page displays offline loading retry chapter list preferences and continuity controls', async () => {
  const source = await readTree('apps/web/src/pages/chapter-reader');
  assert.match(source, /ReaderOfflineBanner/);
  assert.match(source, /ErrorState/);
  assert.match(source, /controller\.retry/);
  assert.match(source, /toggleBookmark/);
  assert.match(source, /recordReadingActivity/);
  assert.match(source, /markChapterRead/);
  assert.match(source, /ReaderToolbar/);
  assert.match(source, /ReaderBottomBar/);
});

test('Task 14 pages and widgets use public slice imports only', async () => {
  const source = [
    await readTree('apps/web/src/pages/novel-detail'),
    await readTree('apps/web/src/pages/chapter-reader'),
    await readTree('apps/web/src/widgets/reader-toolbar'),
    await readTree('apps/web/src/widgets/reader-progress'),
    await readTree('apps/web/src/widgets/reader-bottom-bar')
  ].join('\n');
  assert.doesNotMatch(source, /@\/entities\/[^/'"]+\/(?:api|model|ui)\//);
  assert.doesNotMatch(source, /@\/features\/[^/'"]+\/(?:api|model|ui|lib)\//);
  assert.doesNotMatch(source, /@\/widgets\/[^/'"]+\/(?:api|model|ui|lib)\//);
});

test('router loaders point to real novel detail and chapter reader pages', async () => {
  const preload = await readFile('apps/web/src/app/router/route-preload.ts', 'utf8');
  const router = await readFile('apps/web/src/app/router/AppRouter.tsx', 'utf8');
  assert.match(preload, /import\(['"]@\/pages\/novel-detail['"]\)/);
  assert.match(preload, /import\(['"]@\/pages\/chapter-reader['"]\)/);
  assert.match(router, /module\.NovelDetailPage/);
  assert.match(router, /module\.ChapterReaderPage/);
});
