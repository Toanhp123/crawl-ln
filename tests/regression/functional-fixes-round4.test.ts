import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../../', import.meta.url);
const load = (path: string) => readFile(new URL(path, root), 'utf8');
test('reading continuity and reader cache use stable chapter identity and content version', async () => {
  const continuity = await load(
    'apps/web/src/features/read-chapter/model/readingContinuityStorage.ts'
  );
  const source = await load('apps/web/src/modules/reader/application/reader-chapter-source.ts');
  assert.match(continuity, /chapterId/);
  assert.doesNotMatch(continuity, /Set<number>/);
  assert.match(source, /contentVersion/);
});
test('restore normalizes active tasks and backup input is bounded', async () => {
  const store = await load(
    'apps/api/src/modules/backup/infrastructure/sqlite/sqlite-backup.store.ts'
  );
  const routes = await load('apps/api/src/modules/backup/presentation/routes/backup.routes.ts');
  const archive = await load(
    'apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts'
  );
  assert.match(store, /normalizeRestoredTask/);
  assert.match(routes, /512mb/);
  assert.match(archive, /maxDatabaseBytes/);
});
test('scheduler catches interval failures and checks do not mutate novel updated_at', async () => {
  const scheduler = await load(
    'apps/api/src/modules/scheduler/application/auto-update-scheduler.service.ts'
  );
  const repo = await load(
    'apps/api/src/modules/scheduler/infrastructure/sqlite/auto-update-policy-sqlite.repository.ts'
  );
  assert.match(scheduler, /Scheduler tick failed/);
  const recordState = repo.slice(repo.indexOf('async recordState'));
  assert.doesNotMatch(recordState, /updated_at/);
});
