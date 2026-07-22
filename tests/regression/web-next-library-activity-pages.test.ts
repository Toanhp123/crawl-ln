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

test('library page composes public slices and owns only URL and view state', async () => {
  const source = await readTree('apps/web-next/src/pages/library');
  assert.match(source, /useNovels/);
  assert.match(source, /LibraryGrid/);
  assert.match(source, /LibrarySearchPanel|useSearchLibraryFeature/);
  assert.match(source, /useSearchParams/);
  assert.match(source, /ContinueReadingHero/);
  assert.match(
    source,
    /<LibrarySearchPanel[\s\S]*query=\{model\.keyword\}[\s\S]*showSearchInput=\{false\}/
  );
  assert.doesNotMatch(source, /useQuery\(|useMutation\(|\bhttp\s*\(|queryKeys/);
  assert.doesNotMatch(source, /getNovel\(|useNovel\(|useQueries\(|detailFallback/);
});

test('library preserves twelve-card skeleton geometry pagination and stable route state', async () => {
  const source = await readTree('apps/web-next/src/pages/library');
  assert.match(source, /LIBRARY_PAGE_SIZE\s*=\s*12/);
  assert.match(source, /Array\.from\(\{\s*length:\s*LIBRARY_PAGE_SIZE/);
  assert.match(
    source,
    /grid-cols-2[^'"`]*sm:grid-cols-3[^'"`]*lg:grid-cols-4[^'"`]*xl:grid-cols-5[^'"`]*2xl:grid-cols-6/
  );
  assert.match(source, /searchParams\.set\(['"]page['"]/);
  assert.match(source, /searchParams\.set\(['"]filter['"]/);
  assert.match(source, /searchParams\.set\(['"]sort['"]/);
  assert.match(source, /searchParams\.set\(['"]scope['"]/);
});

test('continue reading matches list summaries to continuity without detail fallbacks', async () => {
  const page = await readTree('apps/web-next/src/pages/library');
  const widget = await readTree('apps/web-next/src/widgets/continue-reading');
  assert.match(page, /listReadingHistory/);
  assert.match(page, /new Map/);
  assert.match(page, /items\.find/);
  assert.match(widget, /bookProgress\s*\?\?\s*readingHistory\.scrollRatio/);
  assert.doesNotMatch(page + widget, /getNovel\(|useNovel\(|useQueries\(|detailFallback/);
});

test('activity page groups tasks and uses disconnected-only polling fallback', async () => {
  const source = await readTree('apps/web-next/src/pages/activity');
  assert.match(source, /useTasks/);
  assert.match(source, /groupActivityTasks/);
  assert.match(source, /running/);
  assert.match(source, /queued/);
  assert.match(source, /recent/);
  assert.match(source, /connectionState/);
  assert.match(source, /15_000/);
  assert.doesNotMatch(source, /RefreshIndicator|SyncIndicator|useQuery\(|useMutation\(/);
});

test('crawl task card renders outcome and progress from public entity types', async () => {
  const source = await readTree('apps/web-next/src/widgets/crawl-task-card');
  assert.match(source, /CrawlTask/);
  assert.match(source, /taskOutcomeLabel/);
  assert.match(source, /ProgressRing/);
  assert.match(source, /fetchedChapters\s*\+\s*task\.failedChapters/);
  assert.doesNotMatch(source, /entities\/task\/(api|model|ui)\//);
});

test('task detail composes separate task-control features and no mutations', async () => {
  const source = await readTree('apps/web-next/src/pages/task-detail');
  assert.match(source, /PauseTaskButton/);
  assert.match(source, /ResumeTaskButton/);
  assert.match(source, /CancelTaskButton/);
  assert.match(source, /useTask\(/);
  assert.match(source, /useTaskEvents\(/);
  assert.match(source, /useNovel\(/);
  assert.doesNotMatch(source, /useMutation\(|\bhttp\s*\(|method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});

test('task detail preserves progress telemetry outcome and event timeline', async () => {
  const source = await readTree('apps/web-next/src/pages/task-detail');
  for (const marker of [
    /taskOutcomeLabel/,
    /currentSpeed/,
    /averageSpeed/,
    /etaSeconds/,
    /totalPausedMs/,
    /failedChapters/,
    /events\.data/,
    /Progress/
  ]) {
    assert.match(source, marker);
  }
  assert.match(source, /connectionState/);
  assert.match(source, /10_000/);
  assert.match(source, /staleTime:\s*5\s*\*\s*60_000/);
});

test('all Task 13 slices expose public indexes and avoid external deep imports', async () => {
  for (const directory of [
    'apps/web-next/src/widgets/continue-reading',
    'apps/web-next/src/widgets/library-grid',
    'apps/web-next/src/widgets/crawl-task-card',
    'apps/web-next/src/pages/library',
    'apps/web-next/src/pages/activity',
    'apps/web-next/src/pages/task-detail'
  ]) {
    assert.match(await readFile(`${directory}/index.ts`, 'utf8'), /export/);
  }
  const source = [
    await readTree('apps/web-next/src/widgets/continue-reading'),
    await readTree('apps/web-next/src/widgets/library-grid'),
    await readTree('apps/web-next/src/widgets/crawl-task-card'),
    await readTree('apps/web-next/src/pages/library'),
    await readTree('apps/web-next/src/pages/activity'),
    await readTree('apps/web-next/src/pages/task-detail')
  ].join('\n');
  assert.doesNotMatch(source, /@\/entities\/[^/'"]+\/(?:api|model|ui)\//);
  assert.doesNotMatch(source, /@\/features\/[^/'"]+\/(?:api|model|ui|lib)\//);
});

test('router loaders now point to the three real Task 13 page modules', async () => {
  const preload = await readFile('apps/web-next/src/app/router/route-preload.ts', 'utf8');
  const router = await readFile('apps/web-next/src/app/router/AppRouter.tsx', 'utf8');
  assert.match(preload, /import\(['"]@\/pages\/library['"]\)/);
  assert.match(preload, /import\(['"]@\/pages\/activity['"]\)/);
  assert.match(preload, /import\(['"]@\/pages\/task-detail['"]\)/);
  assert.match(router, /module\.LibraryPage/);
  assert.match(router, /module\.ActivityPage/);
  assert.match(router, /module\.TaskDetailPage/);
});
