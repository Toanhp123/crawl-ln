import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

const dataPages = [
  'apps/web/src/pages/library/ui/LibraryPage.tsx',
  'apps/web/src/pages/activity/ui/ActivityPage.tsx',
  'apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx',
  'apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx',
  'apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx'
];

test('realtime data pages do not expose manual refresh controls or background refresh indicators', () => {
  for (const path of dataPages) {
    const source = read(path);
    assert.doesNotMatch(source, /common\.(?:refresh|reload)/, path);
    assert.doesNotMatch(source, /RefreshIndicator|SyncIndicator/, path);
  }

  assert.doesNotMatch(read(dataPages[0]), /RefreshCw/);
  assert.doesNotMatch(read(dataPages[1]), /tasks\.refetch\(\)|common\.refresh/);
  assert.doesNotMatch(read(dataPages[3]), /aria-label=\{t\('common\.refresh'\)\}/);
  assert.doesNotMatch(read(dataPages[4]), /detail\.refetch\(\)/);
});

test('real load failures retain explicit retry actions', () => {
  const library = read('apps/web/src/pages/library/ui/LibraryPage.tsx');
  const libraryModel = read('apps/web/src/pages/library/model/useLibraryPage.ts');
  const taskDetail = read('apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx');

  assert.match(library, /actionLabel=\{t\('common\.retry'\)\}/);
  assert.match(library, /model\.retryLoad\(\)/);
  assert.match(libraryModel, /retryLoad:\s*\(\)\s*=>\s*novels\.refetch\(\)/);
  assert.match(taskDetail, /actionLabel=\{t\('common\.retry'\)\}/);
  assert.match(taskDetail, /void task\.refetch\(\)/);
});

test('business reload and retry actions remain available', () => {
  const sources = read('apps/web/src/pages/sources/ui/SourcesPage.tsx');
  const novelUpdate = read('apps/web/src/features/update-novel/ui/UpdateNovelButton.tsx');
  const addOverlay = read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx');

  assert.match(sources, /reload\.mutate/);
  assert.match(sources, /RefreshCw/);
  assert.match(novelUpdate, /updateNovel\.action/);
  assert.match(addOverlay, /addNovel\.isError/);
});

test('obsolete refresh indicator components are removed from the shared UI surface', () => {
  assert.equal(existsSync(resolve('apps/web/src/shared/ui/feedback/RefreshIndicator.tsx')), false);
  assert.equal(existsSync(resolve('apps/web/src/shared/ui/feedback/SyncIndicator.tsx')), false);

  const exports = read('apps/web/src/shared/ui/index.ts');
  assert.doesNotMatch(exports, /RefreshIndicator|SyncIndicator/);
});
