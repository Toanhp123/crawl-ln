import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('task detail and global add flow use canonical task query keys', async () => {
  const keys = await read('apps/web-legacy/src/shared/api/queryKeys.ts');
  const overlay = await read('apps/web-legacy/src/app/layouts/GlobalAddNovelOverlay.tsx');
  const detail = await read('apps/web-legacy/src/pages/task-detail/model/useTaskDetailPage.ts');
  assert.match(keys, /task: \(id: string \| null\)/);
  assert.match(keys, /taskEvents: \(id: string \| null\)/);
  assert.match(detail, /queryKeys\.task\(/);
  assert.match(detail, /queryKeys\.taskEvents\(/);
  assert.match(overlay, /queryKeys\.tasks/);
  assert.match(overlay, /queryKeys\.taskSummary/);
  assert.match(overlay, /queryKeys\.novelTask\(task\.novelId\)/);
  assert.doesNotMatch(overlay, /crawl-import-task|crawl-import-events/);
});

test('library reuses list data for continue reading and cover failure resets by URL', async () => {
  const library = await read('apps/web-legacy/src/pages/library/model/useLibraryPage.ts');
  const cover = await read('apps/web-legacy/src/entities/novel/ui/NovelCover.tsx');
  assert.doesNotMatch(library, /library-count-fallback/);
  assert.doesNotMatch(library, /useQueries|detailFallbacks|getNovel|queryKeys\.novel\(/);
  assert.match(library, /items\.find\(\(novel\) => novel\.id === primaryEntry\?\.novelId\)/);
  assert.match(cover, /useEffect\(\(\) => \{\s*setFailed\(false\);\s*\}, \[coverUrl\]\)/s);
  assert.match(cover, /decoding="async"/);
});

test('query defaults and maintenance lock use production-safe ownership', async () => {
  const client = await read('apps/web-legacy/src/shared/api/queryClient.ts');
  const maintenance = await read('apps/web-legacy/src/shared/maintenance/MaintenanceProvider.tsx');
  const keys = await read('apps/web-legacy/src/shared/api/queryKeys.ts');
  assert.match(client, /staleTime: 15_000/);
  assert.match(maintenance, /runningRef\.current/);
  assert.match(keys, /novelStats: \['novels', 'stats'\]/);
});
