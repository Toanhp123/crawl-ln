import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryError } from '../../apps/api/src/modules/library/domain/errors/library.error.ts';
import type { ReconcileAnalysisCommand } from '../../apps/api/src/modules/library/domain/library.contracts.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/index.ts';
import { createLibraryModule } from '../../apps/api/src/modules/library/library.module.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

const now = '2026-07-21T00:00:00.000Z';

function analysis(id = 'novel-1', title = 'Novel'): ReconcileAnalysisCommand {
  return {
    commandId: `analysis:${id}`,
    analyzedAt: now,
    novel: {
      id,
      title,
      sourceUrl: `https://example.test/${id}`,
      sourceName: 'Example'
    },
    chapters: [
      {
        id: `chapter:${id}:1`,
        index: 1,
        title: 'Chapter 1',
        sourceUrl: `https://example.test/${id}/1`
      }
    ]
  };
}

function createHarness(context: test.TestContext) {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('library', libraryMigrations);
  runRegisteredMigrations(database, registry);
  const module = createLibraryModule(database);
  context.after(() => database.close());
  return { database, module, api: module.api };
}

function countOutbox(database: SqliteDatabase, type: string): number {
  const row = database.connection
    .prepare('SELECT COUNT(*) AS count FROM library_outbox WHERE type = ?')
    .get(type) as { count: number };
  return Number(row.count);
}

function receiptExists(database: SqliteDatabase, commandId: string): boolean {
  return Boolean(
    database.connection
      .prepare('SELECT 1 AS found FROM library_command_receipts WHERE command_id = ?')
      .get(commandId)
  );
}

test('save content is idempotent and increments version only for changed content', async (context) => {
  const { database, api } = createHarness(context);
  const seeded = await api.commands.reconcileAnalysis(analysis());
  const command = {
    commandId: 'content-1',
    novelId: seeded.novel.id,
    chapterId: seeded.chapters[0]!.id,
    title: 'Fetched Chapter 1',
    rawText: 'raw content',
    cleanText: 'clean content',
    savedAt: '2026-07-21T01:00:00.000Z'
  };

  const first = await api.commands.saveChapterContent(command);
  const repeated = await api.commands.saveChapterContent({
    ...command,
    rawText: 'must not replace the receipt result'
  });

  assert.deepEqual(repeated, first);
  assert.equal(first.title, 'Fetched Chapter 1');
  assert.equal(first.status, 'fetched');
  assert.equal(first.contentVersion, 2);
  assert.equal(countOutbox(database, 'library.chapter-content-saved'), 1);

  const unchanged = await api.commands.saveChapterContent({
    ...command,
    commandId: 'content-2',
    savedAt: '2026-07-21T02:00:00.000Z'
  });
  assert.equal(unchanged.contentVersion, 2);
  assert.deepEqual(await api.queries.getChapter(seeded.novel.id, 1), unchanged);
});

test('ingestion state commands enforce the Library lifecycle and replay safely', async (context) => {
  const { database, api } = createHarness(context);
  const seeded = await api.commands.reconcileAnalysis(analysis());

  await assert.rejects(
    () =>
      api.commands.setIngestionState({
        commandId: 'state-invalid',
        novelId: seeded.novel.id,
        status: 'completed',
        updatedAt: '2026-07-21T01:00:00.000Z'
      }),
    (error: unknown) => error instanceof LibraryError && error.code === 'LIBRARY_INVALID_TRANSITION'
  );
  assert.equal(receiptExists(database, 'state-invalid'), false);

  const crawling = {
    commandId: 'state-crawling',
    novelId: seeded.novel.id,
    status: 'crawling' as const,
    updatedAt: '2026-07-21T01:00:00.000Z'
  };
  await api.commands.setIngestionState(crawling);
  await api.commands.setIngestionState(crawling);
  await api.commands.setIngestionState({
    commandId: 'state-completed',
    novelId: seeded.novel.id,
    status: 'completed',
    updatedAt: '2026-07-21T02:00:00.000Z'
  });

  assert.equal((await api.queries.getNovel(seeded.novel.id))?.novel.status, 'completed');
  assert.equal(countOutbox(database, 'library.ingestion-state-changed'), 2);
});

test('library queries paginate, filter and aggregate module-owned data', async (context) => {
  const { api } = createHarness(context);
  await api.commands.reconcileAnalysis(analysis('novel-1', 'Gamma'));
  await api.commands.reconcileAnalysis(analysis('novel-2', 'Alpha'));
  await api.commands.reconcileAnalysis(analysis('novel-3', 'Beta'));
  await api.commands.setIngestionState({
    commandId: 'state:n1:crawling',
    novelId: 'novel-1',
    status: 'crawling',
    updatedAt: '2026-07-21T01:00:00.000Z'
  });
  await api.commands.setIngestionState({
    commandId: 'state:n1:completed',
    novelId: 'novel-1',
    status: 'completed',
    updatedAt: '2026-07-21T02:00:00.000Z'
  });
  await api.commands.setIngestionState({
    commandId: 'state:n3:crawling',
    novelId: 'novel-3',
    status: 'crawling',
    updatedAt: '2026-07-21T01:00:00.000Z'
  });
  await api.commands.setIngestionState({
    commandId: 'state:n3:failed',
    novelId: 'novel-3',
    status: 'failed',
    updatedAt: '2026-07-21T02:00:00.000Z',
    errorMessage: 'network failed'
  });

  const page = await api.queries.listNovels({
    status: 'all',
    sort: 'title',
    limit: 2,
    offset: 1
  });
  assert.equal(page.total, 3);
  assert.deepEqual(
    page.items.map((novel) => novel.title),
    ['Beta', 'Gamma']
  );
  const active = await api.queries.listNovels({
    status: 'active',
    sort: 'title',
    limit: 10,
    offset: 0
  });
  assert.deepEqual(
    active.items.map((novel) => novel.title),
    ['Alpha', 'Beta']
  );
  assert.deepEqual(await api.queries.getStats(), {
    novels: 3,
    analyzed: 1,
    crawling: 0,
    completed: 1,
    failed: 1
  });
  assert.equal((await api.queries.getNovel('novel-2'))?.chapters.length, 1);
});

test('delete novel removes Library records without touching another module table', async (context) => {
  const { database, api } = createHarness(context);
  await api.commands.reconcileAnalysis(analysis());
  database.connection.exec(
    `CREATE TABLE ingestion_jobs(id TEXT PRIMARY KEY);
     INSERT INTO ingestion_jobs(id) VALUES ('job-1');`
  );
  const command = { commandId: 'delete-1', novelId: 'novel-1', deletedAt: now };

  await api.commands.deleteNovel(command);
  await api.commands.deleteNovel(command);

  assert.equal(await api.queries.getNovel('novel-1'), null);
  assert.equal(
    Number(
      (
        database.connection.prepare('SELECT COUNT(*) AS count FROM ingestion_jobs').get() as {
          count: number;
        }
      ).count
    ),
    1
  );
  assert.equal(countOutbox(database, 'library.novel-deleted'), 1);
});

test('library module exposes claimable outbox events', async (context) => {
  const { module, api } = createHarness(context);
  await api.commands.reconcileAnalysis(analysis());

  const events = await module.outbox.claimBatch(10);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'library.analysis-reconciled');
  assert.equal((events[0]?.payload as { commandId: string }).commandId, 'analysis:novel-1');

  await module.outbox.markDelivered([events[0]!.id], '2026-07-21T03:00:00.000Z');
  assert.deepEqual(await module.outbox.claimBatch(10), []);
});
