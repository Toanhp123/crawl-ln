import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const readRoot = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('library consumes list summaries without per-novel detail fallbacks', () => {
  const source = read('pages/library/model/useLibraryPage.ts');
  assert.doesNotMatch(source, /useQueries/);
  assert.doesNotMatch(source, /detailFallbacks/);
  assert.match(source, /const items = novels\.data\?\.items \?\? \[\]/);
});

test('bottom tabs use a dedicated task summary instead of the full task list', () => {
  const source = read('widgets/bottom-tabs/ui/AppBottomTabs.tsx');
  assert.match(source, /useTaskSummary/);
  assert.doesNotMatch(source, /useTasks/);
  assert.match(source, /summary\.data\?\.activeCount/);
});

test('task detail disables live polling while realtime is connected and uses a slow fallback', () => {
  const source = read('pages/task-detail/model/useTaskDetailPage.ts');
  assert.match(source, /useRealtimeStatus/);
  assert.match(source, /getRealtimePollingInterval/);
  assert.match(source, /10_000/);
  assert.doesNotMatch(source, /\? 2000 : false|\? 3000 : false/);
  assert.match(source, /staleTime:\s*5 \* 60_000/);
});

test('source plugin settings use realtime with a slow disconnected fallback', () => {
  const source = read('pages/settings/model/useSettingsPage.tsx');
  const pluginBlock = source.slice(
    source.indexOf('const plugins'),
    source.indexOf('const runScheduler')
  );
  assert.match(source, /useRealtimeStatus/);
  assert.match(pluginBlock, /getRealtimePollingInterval\(realtimeStatus, true, 30_000\)/);
  assert.doesNotMatch(pluginBlock, /refetchInterval:\s*\d/);
});

test('task summary endpoint counts polling tasks without loading task rows', () => {
  const routes = readRoot('apps/api-legacy/src/modules/task/presentation/routes/task.routes.ts');
  const repository = readRoot(
    'apps/api-legacy/src/modules/task/infrastructure/sqlite/task-sqlite.repository.ts'
  );
  assert.match(routes, /router\.get\('\/summary', asyncHandler\(controller\.summary\)\)/);
  assert.ok(routes.indexOf("'/summary'") < routes.indexOf("'/:id'"));
  assert.match(repository, /SELECT COUNT\(\*\) AS count/);
  assert.match(repository, /'queued','running','pausing','resuming'/);
  assert.doesNotMatch(
    repository.slice(
      repository.indexOf('async countActive'),
      repository.indexOf('async findRecoverable')
    ),
    /mapTaskRow/
  );
});

test('task mutations invalidate both task list and task summary', () => {
  for (const path of [
    'features/crawl-novel/model/useCrawlNovel.ts',
    'features/update-novel/model/useUpdateNovel.ts',
    'features/delete-novel/model/useDeleteNovel.ts',
    'pages/task-detail/model/useTaskDetailPage.ts'
  ]) {
    const source = read(path);
    assert.match(source, /queryKeys\.tasks/);
    assert.match(source, /queryKeys\.taskSummary/);
  }
});
