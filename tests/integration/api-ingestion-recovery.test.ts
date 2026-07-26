import assert from 'node:assert/strict';
import test from 'node:test';
import { IngestionQueriesService } from '../../apps/api/src/modules/ingestion/application/queries/ingestion-queries.service.ts';
import { IngestionQueueService } from '../../apps/api/src/modules/ingestion/application/services/ingestion-queue.service.ts';
import { IngestionJobEntity } from '../../apps/api/src/modules/ingestion/domain/entities/ingestion-job.entity.ts';
import type { IngestionJob } from '../../apps/api/src/modules/ingestion/domain/ingestion.models.ts';
import { ingestionMigrations } from '../../apps/api/src/modules/ingestion/index.ts';
import { createIngestionModule } from '../../apps/api/src/modules/ingestion/ingestion.module.ts';
import { IngestionSqliteRepository } from '../../apps/api/src/modules/ingestion/infrastructure/sqlite/ingestion-sqlite.repository.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

const now = '2026-07-21T00:00:00.000Z';

function queued(id: string): IngestionJob {
  return IngestionJobEntity.createQueued({
    id,
    novelId: `novel-${id}`,
    totalChapters: 0,
    now
  }).toPrimitives();
}

test('recovery drains interrupted jobs into paused state and records audit events', async (context) => {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('ingestion', ingestionMigrations);
  runRegisteredMigrations(database, registry);
  context.after(() => database.close());
  const repository = new IngestionSqliteRepository(database);
  const interrupted = [
    queued('queued'),
    IngestionJobEntity.fromPrimitives(queued('running')).markRunning(now).toPrimitives(),
    IngestionJobEntity.fromPrimitives(queued('pausing')).markPausing(now).toPrimitives(),
    IngestionJobEntity.fromPrimitives(queued('resuming'))
      .markPaused(now)
      .markResuming(now)
      .toPrimitives()
  ];
  const alreadyPaused = IngestionJobEntity.fromPrimitives(queued('paused'))
    .markPaused(now)
    .toPrimitives();
  for (const job of [...interrupted, alreadyPaused]) await repository.create(job, []);
  let id = 0;
  const queue = new IngestionQueueService({
    repository,
    runner: {
      async run() {},
      async markFailed() {}
    },
    clock: { now: () => new Date('2026-07-21T01:00:00.000Z') },
    ids: { randomId: () => `recovery-event-${++id}` },
    logger: { error() {} }
  });

  const recovered = await queue.recoverInterrupted(2);

  assert.equal(recovered.length, 4);
  for (const value of interrupted) {
    assert.equal((await repository.findById(value.id))?.status, 'paused');
    assert.equal((await repository.findEvents(value.id))[0]?.type, 'recovered_paused');
  }
  assert.equal((await repository.findEvents(alreadyPaused.id)).length, 0);
  const queries = new IngestionQueriesService(repository);
  assert.deepEqual(await queries.getSummary(), { activeCount: 0 });
  assert.equal((await queries.listJobs({ limit: 10 })).length, 5);
  assert.equal(
    Number(
      (
        database.connection
          .prepare(
            "SELECT COUNT(*) AS count FROM ingestion_outbox WHERE type = 'ingestion.audit-recorded'"
          )
          .get() as { count: number }
      ).count
    ),
    4
  );

  const module = createIngestionModule({
    database,
    library: {
      commands: {
        reconcileAnalysis: async () => {
          throw new Error('not used');
        },
        saveChapterContent: async () => {
          throw new Error('not used');
        },
        setIngestionState: async () => undefined,
        deleteNovel: async () => undefined
      },
      queries: {
        listNovels: async () => {
          throw new Error('not used');
        },
        getNovel: async () => null,
        getChapter: async () => null,
        getStats: async () => ({ novels: 0, analyzed: 0, crawling: 0, completed: 0, failed: 0 })
      }
    },
    sourceReader: {
      readMetadata: async () => {
        throw new Error('not used');
      },
      async *streamChapterList() {
        throw new Error('not used');
      },
      readChapterContent: async () => {
        throw new Error('not used');
      }
    },
    ids: { randomId: () => 'module-event' },
    clock: { now: () => new Date('2026-07-21T02:00:00.000Z') },
    logger: { error() {} }
  });
  assert.deepEqual(Object.keys(module.api.commands).sort(), [
    'analyzeNovel',
    'cancelJob',
    'createJob',
    'pauseJob',
    'refreshNovel',
    'resumeJob'
  ]);
  assert.deepEqual(Object.keys(module.api.queries).sort(), [
    'getJob',
    'getJobEvents',
    'getNovelJob',
    'getSummary',
    'listJobs'
  ]);
  const claimed = await module.outbox.claimBatch(10);
  assert.equal(claimed.length, 4);
  await module.outbox.markDelivered(
    claimed.map((event) => event.id),
    '2026-07-21T03:00:00.000Z'
  );
});
