import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrawlTask } from '@novel-tool/shared';
import {
  isTaskActive,
  isTaskPolling,
  selectLatestActiveTask,
  taskIndicator
} from '../../apps/web/src/entities/task/model/status.ts';

const task = (id: string, status: CrawlTask['status'], updatedAt: string): CrawlTask => ({
  id,
  novelId: `novel-${id}`,
  status,
  totalChapters: 10,
  fetchedChapters: 0,
  failedChapters: 0,
  totalPausedMs: 0,
  currentSpeed: 0,
  averageSpeed: 0,
  createdAt: updatedAt,
  updatedAt
});

test('cancelled tasks use a terminal indicator and never poll', () => {
  assert.equal(taskIndicator('cancelled'), 'cancelled');
  assert.equal(isTaskPolling('cancelled'), false);
  assert.equal(isTaskActive('cancelled'), false);
});

test('latest active task selection ignores newer terminal tasks', () => {
  const selected = selectLatestActiveTask([
    task('old-running', 'running', '2026-07-18T00:00:00.000Z'),
    task('new-cancelled', 'cancelled', '2026-07-18T02:00:00.000Z'),
    task('new-running', 'running', '2026-07-18T01:00:00.000Z')
  ]);

  assert.equal(selected?.id, 'new-running');
});
