import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('global add flow owns URL submission while Activity owns task progress', () => {
  const overlay = read('apps/web-legacy/src/app/layouts/GlobalAddNovelOverlay.tsx');
  const activity = read('apps/web-legacy/src/pages/activity/ui/ActivityPage.tsx');
  const activityModel = read('apps/web-legacy/src/pages/activity/model/useActivityPage.ts');

  assert.match(overlay, /analyzeNovel\(sourceUrl\)/);
  assert.match(overlay, /crawlNovel\(detail\.novel\.id\)/);
  assert.match(overlay, /global-add-novel-url/);
  assert.match(overlay, /overlay\.close\(\)/);
  assert.match(overlay, /globalAdd\.queuedDescription/);
  assert.doesNotMatch(overlay, /ImportProgressCard|ImportTimeline|CompletionCard|getTaskEvents/);
  assert.match(activity, /activity\.running/);
  assert.match(activity, /activity\.queued/);
  assert.match(activity, /activity\.recent/);
  assert.match(activityModel, /running:/);
  assert.match(activityModel, /queued:/);
  assert.match(activityModel, /recent:/);
});

test('legacy crawl and task page slices are removed while compatibility redirects remain', () => {
  for (const path of [
    'apps/web-legacy/src/pages/crawl',
    'apps/web-legacy/src/pages/tasks',
    'apps/web-legacy/src/features/import-novel',
    'apps/web-legacy/src/features/filter-tasks',
    'apps/web-legacy/src/widgets/crawl-command',
    'apps/web-legacy/src/widgets/task-list',
    'apps/web-legacy/src/widgets/task-summary'
  ])
    assert.equal(existsSync(path), false, path);

  const router = read('apps/web-legacy/src/app/router/AppRouter.tsx');
  assert.match(router, /path="\/crawl" element=\{<Navigate to="\/activity" replace \/>\}/);
  assert.match(router, /path="\/tasks" element=\{<Navigate to="\/activity" replace \/>\}/);
});
