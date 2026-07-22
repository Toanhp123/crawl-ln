import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import type { RealtimeEvent } from '@novel-tool/shared';
import {
  createRealtimeInvalidationQueue,
  getRealtimePollingInterval
} from '../../apps/web-legacy/src/shared/realtime/realtimeInvalidation.ts';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

const event = (input: Partial<RealtimeEvent> = {}): RealtimeEvent => ({
  id: '1',
  type: 'data.changed',
  resources: ['tasks'],
  reason: 'crawl.progress',
  occurredAt: '2026-07-19T00:00:00.000Z',
  taskId: 'task-1',
  novelId: 'novel-1',
  ...input
});

test('realtime invalidations are batched and target task and novel query scopes', async () => {
  const calls: Array<readonly unknown[] | undefined> = [];
  const queue = createRealtimeInvalidationQueue(
    {
      invalidateQueries: async (filters?: { queryKey?: readonly unknown[] }) => {
        calls.push(filters?.queryKey);
      }
    },
    { batchWindowMs: 1 }
  );

  queue.enqueue(event());
  queue.enqueue(event({ id: '2', resources: ['tasks', 'novels'] }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(calls, [
    ['tasks', 'list'],
    ['tasks', 'summary'],
    ['tasks', 'detail', 'task-1'],
    ['tasks', 'events', 'task-1'],
    ['novels', 'task', 'novel-1'],
    ['novels', 'list'],
    ['novels', 'stats'],
    ['novels', 'detail', 'novel-1']
  ]);
  queue.dispose();
});

test('connected realtime disables polling and disconnected realtime uses fallback polling', () => {
  assert.equal(getRealtimePollingInterval('connected', true, 10_000), false);
  assert.equal(getRealtimePollingInterval('disconnected', true, 10_000), 10_000);
  assert.equal(getRealtimePollingInterval('connecting', true, 10_000), 10_000);
  assert.equal(getRealtimePollingInterval('disconnected', false, 10_000), false);
});

test('query provider owns realtime lifecycle and polling hooks use realtime status', () => {
  const provider = read('apps/web-legacy/src/app/providers/QueryProvider.tsx');
  assert.match(provider, /RealtimeProvider/);

  const pollingFiles = [
    'apps/web-legacy/src/entities/task/model/useTasks.ts',
    'apps/web-legacy/src/entities/task/model/useTaskSummary.ts',
    'apps/web-legacy/src/pages/library/model/useLibraryPage.ts',
    'apps/web-legacy/src/pages/task-detail/model/useTaskDetailPage.ts',
    'apps/web-legacy/src/pages/novel-detail/model/useNovelDetailPage.ts',
    'apps/web-legacy/src/pages/settings/model/useSettingsPage.tsx',
    'apps/web-legacy/src/features/auto-update/model/useAutoUpdate.ts'
  ];
  for (const path of pollingFiles) {
    const source = read(path);
    assert.match(source, /useRealtimeStatus|getRealtimePollingInterval/);
    assert.doesNotMatch(source, /\? 1200 : false|\? 2000 : false|\? 3000 : false/);
  }
});
