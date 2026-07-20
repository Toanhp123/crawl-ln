import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('frontend API modules use the canonical /api backend routes', async () => {
  const [plugins, search, tasks] = await Promise.all([
    read('apps/web/src/features/manage-source-plugins/api/sourcePlugins.ts'),
    read('apps/web/src/features/search-library/api/searchLibrary.ts'),
    read('apps/web/src/entities/task/api/taskApi.ts')
  ]);
  assert.match(plugins, /['"]\/api\/source-reader\/plugins/);
  assert.doesNotMatch(plugins, /['"]\/api\/plugins/);
  assert.match(search, /['"]\/api\/search/);
  assert.match(tasks, /['"]\/api\/tasks/);
  assert.doesNotMatch(tasks, /listTasks\(\).*\/api\/crawl\/jobs/);
});

test('frontend consumes only the canonical response envelope', async () => {
  const [http, backup] = await Promise.all([
    read('apps/web/src/shared/api/http.ts'),
    read('apps/web/src/features/backup-library/api/backupLibrary.ts')
  ]);
  assert.match(http, /ApiResponse/);
  assert.doesNotMatch(http, /payload as T/);
  assert.doesNotMatch(backup, /'data' in envelope/);
  assert.doesNotMatch(backup, /\| RestoreResult/);
});

test('frontend error contracts use the shared backend error code union', async () => {
  const errors = await read('apps/web/src/shared/api/errors.ts');
  assert.match(errors, /ApiErrorCode/);
  assert.doesNotMatch(errors, /code\?: string/);
});

test('frontend build version follows package metadata instead of a stale hard-coded release', async () => {
  const build = await read('apps/web/src/shared/config/build.ts');
  assert.doesNotMatch(build, /2\.6\.0/);
  assert.match(build, /__APP_VERSION__/);
});
