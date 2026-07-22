import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('bottom navigation derives its columns from the number of items', () => {
  const source = read('apps/web-legacy/src/shared/ui/navigation/BottomNav.tsx');
  assert.match(source, /repeat\(\$\{items\.length\}/);
  assert.doesNotMatch(source, /grid-cols-4/);
});

test('task polling is disabled by realtime and degrades to a slow disconnected fallback', () => {
  const source = read('apps/web-legacy/src/entities/task/model/useTasks.ts');
  assert.match(source, /useRealtimeStatus/);
  assert.match(source, /getRealtimePollingInterval/);
  assert.match(source, /15_000/);
  assert.doesNotMatch(source, /\? 2000 : false/);
  assert.match(source, /refetchIntervalInBackground: false/);
});

test('activity and library avoid page-owned five-second full-dataset polling', () => {
  const activity = read('apps/web-legacy/src/pages/activity/model/useActivityPage.ts');
  const library = read('apps/web-legacy/src/pages/library/model/useLibraryPage.ts');
  assert.doesNotMatch(activity, /getNovelStats|toCrawlDashboard|refetchInterval:\s*5000/);
  assert.doesNotMatch(library, /refetchInterval:\s*5000/);
  assert.equal(
    existsSync(new URL('../../apps/web-legacy/src/pages/crawl', import.meta.url)),
    false
  );
});

test('content search stays inside library and does not run for an empty query', () => {
  const source = read('apps/web-legacy/src/features/search-library/model/useSearchLibrary.ts');
  const library = read('apps/web-legacy/src/pages/library/ui/LibraryPage.tsx');
  assert.match(source, /enabled: q\.length > 0/);
  assert.match(library, /LibraryContentSearch/);
  assert.doesNotMatch(library, /navigate\('\/search/);
});

test('home route redirects synchronously without startup data fetching', () => {
  const router = read('apps/web-legacy/src/app/router/AppRouter.tsx');
  const redirect = read('apps/web-legacy/src/app/router/HomeRedirect.tsx');
  assert.match(router, /<HomeRedirect \/>/);
  assert.match(redirect, /<Navigate\s+to="\/library"\s+replace\s*\/>/);
  assert.doesNotMatch(redirect, /useQuery|listNovels|LoadingState/);
});

test('skip links and automatic synchronization recovery use localized action copy', () => {
  assert.match(read('apps/web-legacy/src/app/layouts/AppShell.tsx'), /common\.skipToContent/);
  assert.match(read('apps/web-legacy/src/app/layouts/ReaderShell.tsx'), /common\.skipToReader/);
  assert.doesNotMatch(
    read('apps/web-legacy/src/pages/activity/ui/ActivityPage.tsx'),
    /common\.refresh/
  );
  assert.match(
    read('apps/web-legacy/src/pages/task-detail/ui/TaskDetailPage.tsx'),
    /common\.retry/
  );
});
