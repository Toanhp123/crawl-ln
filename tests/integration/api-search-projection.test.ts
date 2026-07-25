import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryModule } from '../../apps/api/src/modules/library/library.module.ts';
import { createSearchModule } from '../../apps/api/src/modules/search/search.module.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { InMemoryEventBus } from '../../apps/api/src/platform/events/in-memory-event-bus.ts';

const analyzedAt = '2026-07-21T08:00:00.000Z';
const savedAt = '2026-07-21T08:05:00.000Z';

function analysis(commandId = 'analysis-1') {
  return {
    commandId,
    analyzedAt,
    novel: {
      id: 'novel-1',
      title: 'Dragon Chronicle',
      sourceUrl: 'https://fixture.test/novel-1',
      sourceName: 'fixture'
    },
    chapters: [
      {
        id: 'chapter-1',
        index: 1,
        title: 'The Awakening',
        sourceUrl: 'https://fixture.test/novel-1/chapter-1'
      }
    ]
  };
}

function fixture(t: test.TestContext) {
  const database = new SqliteDatabase(':memory:');
  const events = new InMemoryEventBus();
  const library = createLibraryModule(database);
  const search = createSearchModule({
    database,
    library: library.api.queries,
    events,
    clock: { now: () => new Date(savedAt) },
    ids: { randomId: () => 'search-event-id' }
  });
  for (const migration of [...library.migrations, ...search.migrations]) {
    migration.up(database.connection);
  }
  t.after(async () => {
    await search.stop();
    database.close();
  });

  const dispatchLibraryEvents = async (duplicate = false) => {
    const claimed = await library.outbox.claimBatch(20);
    for (const event of claimed) {
      await events.publish(event);
      if (duplicate) await events.publish(event);
      await library.outbox.markDelivered([event.id], savedAt);
    }
    return claimed;
  };

  return { database, events, library, search, dispatchLibraryEvents };
}

function documentCount(database: SqliteDatabase): number {
  return Number(
    (
      database.connection.prepare('SELECT COUNT(*) AS count FROM search_documents').get() as {
        count: number;
      }
    ).count
  );
}

test('library events build and update search documents idempotently', async (t) => {
  const { database, library, search, dispatchLibraryEvents } = fixture(t);
  await search.start();
  const detail = await library.api.commands.reconcileAnalysis(analysis());
  await dispatchLibraryEvents(true);

  await library.api.commands.saveChapterContent({
    commandId: 'content-1',
    novelId: detail.novel.id,
    chapterId: detail.chapters[0]!.id,
    title: detail.chapters[0]!.title,
    rawText: 'A dragon wakes beneath the mountain.',
    cleanText: 'A dragon wakes beneath the mountain.',
    savedAt
  });
  await dispatchLibraryEvents(true);

  const result = await search.api.queries.search({
    query: 'dragon',
    type: 'all',
    limit: 20,
    offset: 0
  });
  assert.equal(documentCount(database), 2);
  assert.equal(
    Number(
      (
        database.connection
          .prepare('SELECT COUNT(*) AS count FROM search_projection_checkpoints')
          .get() as { count: number }
      ).count
    ),
    2
  );
  assert.match(result.items.find((item) => item.type === 'chapter')?.snippet ?? '', /dragon/i);
});

test('library delete events remove every projection for the novel', async (t) => {
  const { database, library, search, dispatchLibraryEvents } = fixture(t);
  await search.start();
  await library.api.commands.reconcileAnalysis(analysis());
  await dispatchLibraryEvents();

  await library.api.commands.deleteNovel({
    commandId: 'delete-1',
    novelId: 'novel-1',
    deletedAt: savedAt
  });
  await dispatchLibraryEvents(true);

  assert.equal(documentCount(database), 0);
});

test('chapter content events can rebuild their projection without prior search state', async (t) => {
  const { library, search, events } = fixture(t);
  await search.start();
  const detail = await library.api.commands.reconcileAnalysis(analysis());
  const [analysisEvent] = await library.outbox.claimBatch(20);
  await library.outbox.markDelivered([analysisEvent!.id], savedAt);

  await library.api.commands.saveChapterContent({
    commandId: 'content-1',
    novelId: detail.novel.id,
    chapterId: detail.chapters[0]!.id,
    title: detail.chapters[0]!.title,
    rawText: 'A dragon wakes beneath the mountain.',
    cleanText: 'A dragon wakes beneath the mountain.',
    savedAt
  });
  const [contentEvent] = await library.outbox.claimBatch(20);
  await events.publish(contentEvent!);

  const result = await search.api.queries.search({
    query: 'dragon',
    type: 'chapter',
    limit: 20,
    offset: 0
  });
  assert.equal(result.items[0]?.novelTitle, 'Dragon Chronicle');
});

test('search rebuild projects current Library state through public queries', async (t) => {
  const { database, library, search } = fixture(t);
  await search.start();
  const detail = await library.api.commands.reconcileAnalysis({
    ...analysis(),
    chapters: [
      ...analysis().chapters,
      {
        id: 'chapter-removed',
        index: 2,
        title: 'Removed Chapter',
        sourceUrl: 'https://fixture.test/novel-1/chapter-removed'
      }
    ]
  });
  await library.api.commands.saveChapterContent({
    commandId: 'content-1',
    novelId: detail.novel.id,
    chapterId: detail.chapters[0]!.id,
    title: detail.chapters[0]!.title,
    rawText: 'The dragon returns.',
    cleanText: 'The dragon returns.',
    savedAt
  });
  await library.api.commands.reconcileAnalysis({
    ...analysis('analysis-2'),
    analyzedAt: '2026-07-21T08:10:00.000Z'
  });

  const rebuilt = await search.api.commands.rebuild();
  const result = await search.api.queries.search({
    query: 'dragon',
    type: 'chapter',
    limit: 20,
    offset: 0
  });

  assert.deepEqual(rebuilt, { indexedDocuments: 2, rebuiltAt: savedAt });
  assert.equal(documentCount(database), 2);
  assert.deepEqual(await search.api.queries.status(), {
    rebuildRunning: false,
    indexedDocuments: 2,
    lastRebuiltAt: savedAt,
    lastIndexedDocuments: 2
  });
  assert.deepEqual(
    result.items.map((item) => item.documentId),
    ['chapter-1']
  );
});
