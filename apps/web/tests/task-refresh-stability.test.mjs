import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('task query uses only the disconnected realtime polling fallback', () => {
  const source = read('entities/task/model/useTasks.ts');
  assert.match(source, /getRealtimePollingInterval\(realtimeStatus, enabled, 15_000\)/);
  assert.doesNotMatch(source, /\? 2000 : false/);
  assert.match(source, /refetchIntervalInBackground: false/);
});

test('task query does not refetch merely because the window regains focus', () => {
  const source = read('entities/task/model/useTasks.ts');
  assert.match(source, /refetchOnWindowFocus: options\.refetchOnWindowFocus \?\? false/);
});

test('realtime pages do not reserve header space for refresh indicators', () => {
  assert.doesNotMatch(read('pages/activity/ui/ActivityPage.tsx'), /RefreshIndicator|SyncIndicator/);
  assert.doesNotMatch(
    read('app/layouts/GlobalAddNovelOverlay.tsx'),
    /RefreshIndicator|SyncIndicator/
  );
  assert.equal(
    existsSync(new URL('../src/shared/ui/feedback/RefreshIndicator.tsx', import.meta.url)),
    false
  );
  assert.equal(
    existsSync(new URL('../src/shared/ui/feedback/SyncIndicator.tsx', import.meta.url)),
    false
  );
});
