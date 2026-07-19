import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('database migration persists auto update policy and diagnostics', () => {
  const source = read('apps/api/src/shared/database/sqlite.ts');
  assert.match(source, /auto_update_enabled/);
  assert.match(source, /update_interval_minutes/);
  assert.match(source, /novel_update_diagnostics/);
});

test('scheduler skips novels with active tasks and applies failure backoff', () => {
  const source = read(
    'apps/api/src/modules/scheduler/application/auto-update-scheduler.service.ts'
  );
  assert.match(source, /hasActiveForNovel/);
  assert.match(source, /skipped_active_task/);
  assert.match(source, /FAILURE_BACKOFF_MINUTES/);
});

test('scheduler API exposes status, manual tick, policy and diagnostics', () => {
  const schedulerRoutes = read('apps/api/src/modules/scheduler/presentation/scheduler.routes.ts');
  const novelRoutes = read('apps/api/src/modules/scheduler/presentation/scheduler-novel.routes.ts');
  assert.match(schedulerRoutes, /\/status/);
  assert.match(schedulerRoutes, /\/tick/);
  assert.match(novelRoutes, /auto-update/);
  assert.match(novelRoutes, /update-diagnostics/);
});

test('novel detail and settings expose scheduler controls', () => {
  const novelPage = read('apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  const settingsPage = read('apps/web/src/pages/settings/ui/SettingsPage.tsx');
  assert.match(novelPage, /AutoUpdatePanel/);
  assert.match(settingsPage, /scheduler\.runNow/);
  assert.match(settingsPage, /scheduler\.monitored/);
});
