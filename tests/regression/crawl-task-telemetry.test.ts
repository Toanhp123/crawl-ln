import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlTaskEntity } from '../../apps/api/src/modules/task/domain/entities/task.entity.ts';

test('graceful pause lifecycle preserves progress and clears live telemetry', () => {
  const task = CrawlTaskEntity.createQueued({
    id: 't1',
    novelId: 'n1',
    totalChapters: 10,
    now: '2026-07-15T00:00:00.000Z'
  })
    .markRunning('2026-07-15T00:00:01.000Z')
    .recordChapterResult(
      true,
      false,
      { currentSpeed: 1.5, averageSpeed: 1.2, etaSeconds: 6 },
      '2026-07-15T00:00:02.000Z'
    )
    .markPausing('2026-07-15T00:00:03.000Z')
    .markPaused('2026-07-15T00:00:04.000Z')
    .toPrimitives();
  assert.equal(task.status, 'paused');
  assert.equal(task.fetchedChapters, 1);
  assert.equal(task.currentSpeed, 0);
  assert.equal(task.etaSeconds, undefined);
  assert.equal(task.pausedAt, '2026-07-15T00:00:04.000Z');
});

test('successful retry replaces a previous failed chapter instead of double counting it', () => {
  const failed = CrawlTaskEntity.createQueued({
    id: 't1',
    novelId: 'n1',
    totalChapters: 1,
    now: '2026-07-15T00:00:00.000Z'
  })
    .markRunning('2026-07-15T00:00:01.000Z')
    .recordChapterResult(
      false,
      false,
      { currentSpeed: 1, averageSpeed: 1 },
      '2026-07-15T00:00:02.000Z'
    );
  const retried = failed
    .recordChapterResult(
      true,
      true,
      { currentSpeed: 1, averageSpeed: 1, etaSeconds: 0 },
      '2026-07-15T00:00:03.000Z'
    )
    .toPrimitives();
  assert.equal(retried.fetchedChapters, 1);
  assert.equal(retried.failedChapters, 0);
  assert.equal(retried.fetchedChapters + retried.failedChapters, 1);
});
