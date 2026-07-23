import assert from 'node:assert/strict';
import test from 'node:test';
import { IngestionJobEntity } from '../../apps/api/src/modules/ingestion/domain/entities/ingestion-job.entity.ts';
import { IngestionError } from '../../apps/api/src/modules/ingestion/domain/errors/ingestion.error.ts';
import type { IngestionJob } from '../../apps/api/src/modules/ingestion/domain/ingestion.models.ts';

const now = '2026-07-21T00:00:00.000Z';

function job(overrides: Partial<IngestionJob> = {}): IngestionJob {
  return {
    id: 'job-1',
    novelId: 'novel-1',
    status: 'queued',
    totalChapters: 2,
    fetchedChapters: 0,
    failedChapters: 0,
    totalPausedMs: 0,
    currentSpeed: 0,
    averageSpeed: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test('ingestion job tracks pause duration while resuming a running job', () => {
  const resumed = IngestionJobEntity.fromPrimitives(job())
    .markRunning('2026-07-21T00:00:01.000Z')
    .markPausing('2026-07-21T00:00:02.000Z')
    .markPaused('2026-07-21T00:00:03.000Z')
    .markResuming('2026-07-21T00:00:04.000Z')
    .markRunning('2026-07-21T00:00:05.000Z')
    .toPrimitives();

  assert.equal(resumed.status, 'running');
  assert.equal(resumed.startedAt, '2026-07-21T00:00:01.000Z');
  assert.equal(resumed.totalPausedMs, 2_000);
  assert.equal(resumed.pausedAt, undefined);
});

test('ingestion job derives success, partial and failure outcomes', () => {
  const running = (totalChapters: number) =>
    IngestionJobEntity.createQueued({
      id: 'job',
      novelId: 'novel',
      totalChapters,
      now
    }).markRunning('2026-07-21T00:00:01.000Z');
  const metrics = { currentSpeed: 2, averageSpeed: 1.5, etaSeconds: 3 };

  const success = running(1)
    .recordChapterResult(true, false, metrics, '2026-07-21T00:00:02.000Z')
    .complete('2026-07-21T00:00:03.000Z')
    .toPrimitives();
  const partial = running(2)
    .recordChapterResult(true, false, metrics, '2026-07-21T00:00:02.000Z')
    .recordChapterResult(false, false, metrics, '2026-07-21T00:00:03.000Z')
    .complete('2026-07-21T00:00:04.000Z')
    .toPrimitives();
  const failure = running(1)
    .recordChapterResult(false, false, metrics, '2026-07-21T00:00:02.000Z')
    .complete('2026-07-21T00:00:03.000Z')
    .toPrimitives();

  assert.deepEqual([success.status, success.outcome], ['completed', 'success']);
  assert.deepEqual([partial.status, partial.outcome], ['completed', 'partial']);
  assert.deepEqual([failure.status, failure.outcome], ['failed', 'failure']);
});

test('successful retry replaces a previous chapter failure without breaking counters', () => {
  const corrected = IngestionJobEntity.createQueued({
    id: 'job',
    novelId: 'novel',
    totalChapters: 1,
    now
  })
    .markRunning('2026-07-21T00:00:01.000Z')
    .recordChapterResult(
      false,
      false,
      { currentSpeed: 1, averageSpeed: 1 },
      '2026-07-21T00:00:02.000Z'
    )
    .recordChapterResult(
      true,
      true,
      { currentSpeed: 1, averageSpeed: 1, etaSeconds: 0 },
      '2026-07-21T00:00:03.000Z'
    )
    .toPrimitives();

  assert.equal(corrected.fetchedChapters, 1);
  assert.equal(corrected.failedChapters, 0);
  assert.equal(corrected.etaSeconds, 0);
});

test('ingestion job rejects reopening a terminal state', () => {
  const completed = IngestionJobEntity.fromPrimitives(
    job({
      status: 'completed',
      outcome: 'success',
      totalChapters: 1,
      fetchedChapters: 1,
      finishedAt: now
    })
  );

  assert.throws(
    () => completed.resume('2026-07-21T01:00:00.000Z'),
    (error: unknown) =>
      error instanceof IngestionError && error.code === 'INGESTION_INVALID_TRANSITION'
  );
});

test('ingestion job rejects invalid counters, metrics and terminal outcomes', () => {
  const invalid = [
    job({ totalChapters: 1, fetchedChapters: 1, failedChapters: 1 }),
    job({ currentSpeed: -1 }),
    job({ status: 'completed', outcome: undefined, finishedAt: now })
  ];

  for (const value of invalid) {
    assert.throws(
      () => IngestionJobEntity.fromPrimitives(value),
      (error: unknown) =>
        error instanceof IngestionError && error.code === 'INGESTION_VALIDATION_ERROR'
    );
  }
});
