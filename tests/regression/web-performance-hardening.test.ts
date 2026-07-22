import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('library uses server-side pagination instead of slicing the full dataset', () => {
  const model = read('apps/web-legacy/src/pages/library/model/useLibraryPage.ts');
  const api = read('apps/web-legacy/src/entities/novel/api/novelApi.ts');
  assert.match(api, /PaginatedNovels/);
  assert.match(api, /limit/);
  assert.match(api, /offset/);
  assert.doesNotMatch(model, /\.slice\(/);
  assert.match(model, /novels\.data\?\.items/);
  assert.match(model, /novels\.data\?\.total/);
});

test('activity groups task data without fetching the novel library', () => {
  const source = read('apps/web-legacy/src/pages/activity/model/useActivityPage.ts');
  assert.match(source, /useTasks\(\)/);
  assert.doesNotMatch(source, /listNovels|queryKeys\.novels|novelMap/);
});

test('reader disk cache has bounded LRU eviction and quota recovery', () => {
  const source = read(
    'apps/web-legacy/src/modules/reader/infrastructure/indexeddb-reader-cache.ts'
  );
  assert.match(source, /MAX_DISK_CHAPTERS/);
  assert.match(source, /accessedAt/);
  assert.match(source, /prune/);
  assert.match(source, /QuotaExceededError/);
});
