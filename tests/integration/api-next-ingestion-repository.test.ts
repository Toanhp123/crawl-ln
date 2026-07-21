import assert from 'node:assert/strict';
import test from 'node:test';
import { IngestionJobEntity } from '../../apps/api-next/src/modules/ingestion/domain/entities/ingestion-job.entity.ts';
import { IngestionError } from '../../apps/api-next/src/modules/ingestion/domain/errors/ingestion.error.ts';
import type { IngestionJob } from '../../apps/api-next/src/modules/ingestion/domain/ingestion.models.ts';
import { ingestionMigrations } from '../../apps/api-next/src/modules/ingestion/index.ts';
import { IngestionSqliteRepository } from '../../apps/api-next/src/modules/ingestion/infrastructure/sqlite/ingestion-sqlite.repository.ts';
import { MigrationRegistry } from '../../apps/api-next/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api-next/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api-next/src/platform/database/sqlite-database.ts';

const now = '2026-07-21T00:00:00.000Z';

function queued(id: string, novelId: string, totalChapters = 2): IngestionJob {
  return IngestionJobEntity.createQueued({ id, novelId, totalChapters, now }).toPrimitives();
}

function createHarness(context: test.TestContext) {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('ingestion', ingestionMigrations);
  runRegisteredMigrations(database, registry);
  context.after(() => database.close());
  return { database, repository: new IngestionSqliteRepository(database) };
}

test('repository creates jobs with ordered chapter work', async (context) => {
  const { repository } = createHarness(context);
  const value = queued('job-1', 'novel-1');

  await repository.create(value, ['chapter-2', 'chapter-1']);

  assert.deepEqual(await repository.findById(value.id), value);
  assert.deepEqual(await repository.findChapterIds(value.id), ['chapter-2', 'chapter-1']);
  assert.equal(await repository.hasActiveForNovel(value.novelId), true);
});

test('repository enforces one active job per novel and releases it after completion', async (context) => {
  const { repository } = createHarness(context);
  const first = queued('job-1', 'novel-1', 0);
  await repository.create(first, []);

  await assert.rejects(
    () => repository.create(queued('job-2', 'novel-1', 0), []),
    (error: unknown) =>
      error instanceof IngestionError && error.code === 'INGESTION_ACTIVE_JOB_CONFLICT'
  );

  const completed = IngestionJobEntity.fromPrimitives(first)
    .markRunning('2026-07-21T00:00:01.000Z')
    .complete('2026-07-21T00:00:02.000Z')
    .toPrimitives();
  await repository.update(completed);
  await repository.create(queued('job-2', 'novel-1', 0), []);
  assert.equal((await repository.findByNovelId('novel-1'))?.id, 'job-2');
});

test('repository exposes active, recoverable and interrupted job queries', async (context) => {
  const { repository } = createHarness(context);
  const queuedJob = queued('queued', 'novel-queued', 0);
  const pausedJob = IngestionJobEntity.fromPrimitives(queued('paused', 'novel-paused', 0))
    .markPaused('2026-07-21T00:00:01.000Z')
    .toPrimitives();
  const completedJob = IngestionJobEntity.fromPrimitives(queued('completed', 'novel-completed', 0))
    .markRunning('2026-07-21T00:00:01.000Z')
    .complete('2026-07-21T00:00:02.000Z')
    .toPrimitives();
  await repository.create(queuedJob, []);
  await repository.create(pausedJob, []);
  await repository.create(completedJob, []);

  assert.equal(await repository.countActive(), 1);
  assert.deepEqual((await repository.findRecoverable()).map((job) => job.id).sort(), [
    'paused',
    'queued'
  ]);
  assert.deepEqual(
    (await repository.findInterrupted()).map((job) => job.id),
    ['queued']
  );
  assert.equal(await repository.hasActiveForNovel('novel-paused'), true);
  assert.deepEqual(
    (await repository.findAll(10, 'completed')).map((job) => job.id),
    ['completed']
  );
});

test('repository rejects invalid persisted rows through strict schemas', async (context) => {
  const { database, repository } = createHarness(context);
  await repository.create(queued('job-1', 'novel-1', 0), []);
  database.connection
    .prepare("UPDATE ingestion_jobs SET created_at = 'not-a-timestamp' WHERE id = 'job-1'")
    .run();

  await assert.rejects(() => repository.findById('job-1'));
});
