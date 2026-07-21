import assert from 'node:assert/strict';
import test from 'node:test';
import { ReconcileAnalysisCommandHandler } from '../../apps/api-next/src/modules/library/application/commands/reconcile-analysis.command.ts';
import { LibraryError } from '../../apps/api-next/src/modules/library/domain/errors/library.error.ts';
import type { ReconcileAnalysisCommand } from '../../apps/api-next/src/modules/library/domain/library.contracts.ts';
import { libraryMigrations } from '../../apps/api-next/src/modules/library/index.ts';
import { LibrarySqliteRepository } from '../../apps/api-next/src/modules/library/infrastructure/sqlite/library-sqlite.repository.ts';
import { LibrarySqliteUnitOfWork } from '../../apps/api-next/src/modules/library/infrastructure/sqlite/library-sqlite.unit-of-work.ts';
import { MigrationRegistry } from '../../apps/api-next/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api-next/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api-next/src/platform/database/sqlite-database.ts';

const firstAnalyzedAt = '2026-07-21T00:00:00.000Z';
const secondAnalyzedAt = '2026-07-21T01:00:00.000Z';

function analysis(overrides: Partial<ReconcileAnalysisCommand> = {}): ReconcileAnalysisCommand {
  return {
    commandId: 'analysis-1',
    analyzedAt: firstAnalyzedAt,
    novel: {
      id: 'novel-1',
      title: 'Novel',
      sourceUrl: 'https://example.test/novel',
      sourceName: 'Example',
      author: 'Original Author',
      coverUrl: 'https://example.test/cover.jpg'
    },
    chapters: [
      {
        id: 'chapter-a',
        index: 1,
        title: 'Chapter A',
        sourceUrl: 'https://www.example.test/chapter/42.html?utm=old#fragment'
      },
      {
        id: 'chapter-b',
        index: 2,
        title: 'Chapter B',
        sourceUrl: 'https://example.test/chapter/43'
      },
      {
        id: 'chapter-gone',
        index: 3,
        title: 'Chapter Gone',
        sourceUrl: 'https://example.test/chapter/gone'
      }
    ],
    ...overrides
  };
}

function createHarness(context: test.TestContext) {
  const database = new SqliteDatabase(':memory:');
  const registry = new MigrationRegistry();
  registry.register('library', libraryMigrations);
  runRegisteredMigrations(database, registry);
  context.after(() => database.close());

  const repository = new LibrarySqliteRepository(database);
  const unitOfWork = new LibrarySqliteUnitOfWork(database, repository);
  const handler = new ReconcileAnalysisCommandHandler(unitOfWork);
  return { database, handler, repository };
}

function rowCount(database: SqliteDatabase, table: string): number {
  const row = database.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return Number(row.count);
}

test('reconcile analysis inserts a canonical result and replays command receipts', async (context) => {
  const { database, handler } = createHarness(context);
  const command = analysis();

  const first = await handler.execute(command);
  const repeated = await handler.execute({
    ...command,
    novel: { ...command.novel, title: 'Must not overwrite the receipt result' }
  });

  assert.deepEqual(repeated, first);
  assert.equal(first.novel.id, 'novel-1');
  assert.deepEqual(
    first.chapters.map((chapter) => chapter.id),
    ['chapter-a', 'chapter-b', 'chapter-gone']
  );
  assert.equal(rowCount(database, 'library_novels'), 1);
  assert.equal(rowCount(database, 'library_chapters'), 3);
  assert.equal(rowCount(database, 'library_command_receipts'), 1);
  assert.equal(rowCount(database, 'library_outbox'), 1);

  const outbox = database.connection
    .prepare('SELECT type, payload_json FROM library_outbox')
    .get() as { type: string; payload_json: string };
  assert.equal(outbox.type, 'library.analysis-reconciled');
  assert.deepEqual(JSON.parse(outbox.payload_json), {
    commandId: command.commandId,
    novel: first.novel,
    chapters: first.chapters
  });
});

test('reconcile analysis preserves identity and content across normalized source URLs', async (context) => {
  const { database, handler } = createHarness(context);
  await handler.execute(analysis());
  database.connection
    .prepare(
      `UPDATE library_chapters
          SET raw_text = ?, clean_text = ?, status = 'fetched', content_version = 4,
              updated_at = ?
        WHERE id = ?`
    )
    .run('saved raw', 'saved content', firstAnalyzedAt, 'chapter-a');

  const refreshed = await handler.execute(
    analysis({
      commandId: 'analysis-2',
      analyzedAt: secondAnalyzedAt,
      novel: {
        id: 'replacement-novel-id',
        title: 'Updated Novel',
        sourceUrl: 'https://example.test/novel',
        sourceName: 'Updated Source',
        author: 'Updated Author'
      },
      chapters: [
        {
          id: 'chapter-new',
          index: 1,
          title: 'New Chapter',
          sourceUrl: 'https://example.test/chapter/new'
        },
        {
          id: 'replacement-chapter-id',
          index: 2,
          title: 'Chapter A Renamed',
          sourceUrl: 'https://example.test/chapter/42/'
        },
        {
          id: 'replacement-b-id',
          index: 3,
          title: 'Chapter B',
          sourceUrl: 'https://example.test/chapter/43'
        }
      ]
    })
  );

  assert.equal(refreshed.novel.id, 'novel-1');
  assert.equal(refreshed.novel.createdAt, firstAnalyzedAt);
  assert.equal(refreshed.novel.updatedAt, secondAnalyzedAt);
  assert.equal(refreshed.novel.title, 'Updated Novel');
  assert.equal(refreshed.novel.author, 'Updated Author');
  assert.deepEqual(
    refreshed.chapters.map((chapter) => [chapter.index, chapter.id]),
    [
      [1, 'chapter-new'],
      [2, 'chapter-a'],
      [3, 'chapter-b']
    ]
  );

  const preserved = refreshed.chapters[1]!;
  assert.equal(preserved.sourceUrl, 'https://example.test/chapter/42/');
  assert.equal(preserved.rawText, 'saved raw');
  assert.equal(preserved.cleanText, 'saved content');
  assert.equal(preserved.status, 'fetched');
  assert.equal(preserved.contentVersion, 4);

  const missing = database.connection
    .prepare(
      `SELECT source_available, chapter_index
         FROM library_chapters
        WHERE id = 'chapter-gone'`
    )
    .get() as { source_available: number; chapter_index: number };
  assert.equal(missing.source_available, 0);
  assert.ok(Number(missing.chapter_index) > 3);
});

test('reconcile analysis rolls back every write when chapter validation fails', async (context) => {
  const { database, handler } = createHarness(context);
  const command = analysis({
    chapters: [
      analysis().chapters[0]!,
      {
        id: 'invalid-chapter',
        index: -1,
        title: 'Invalid',
        sourceUrl: 'https://example.test/chapter/invalid'
      }
    ]
  });

  await assert.rejects(
    () => handler.execute(command),
    (error: unknown) => error instanceof LibraryError && error.code === 'LIBRARY_VALIDATION_ERROR'
  );
  assert.equal(rowCount(database, 'library_novels'), 0);
  assert.equal(rowCount(database, 'library_chapters'), 0);
  assert.equal(rowCount(database, 'library_command_receipts'), 0);
  assert.equal(rowCount(database, 'library_outbox'), 0);
});
