import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMigrations } from '../../apps/api/src/modules/search/index.ts';
import { SearchSqliteRepository } from '../../apps/api/src/modules/search/infrastructure/sqlite/search-sqlite.repository.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

function databaseFixture(context: test.TestContext) {
  const database = new SqliteDatabase(':memory:');
  context.after(() => database.close());
  for (const migration of searchMigrations) migration.up(database.connection);
  return database;
}

const documents = [
  {
    type: 'novel' as const,
    documentId: 'novel-1',
    novelId: 'novel-1',
    title: 'Dragon Chronicle',
    subtitle: 'fixture',
    content: ''
  },
  {
    type: 'chapter' as const,
    documentId: 'chapter-1',
    novelId: 'novel-1',
    chapterIndex: 1,
    title: 'Awakening',
    subtitle: 'Dragon Chronicle',
    content: 'The dragon wakes.'
  }
];

test('Search v2 creates constrained one-row rebuild metadata without seeding it', (context) => {
  const database = databaseFixture(context);

  const table = database.connection
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'search_index_metadata'"
    )
    .get() as { sql: string } | undefined;

  assert.ok(table);
  assert.match(table.sql, /CHECK\s*\(\s*id\s*=\s*1\s*\)/i);
  assert.match(table.sql, /CHECK\s*\(\s*last_indexed_documents\s*>=\s*0\s*\)/i);

  const count = database.connection
    .prepare('SELECT COUNT(*) AS count FROM search_index_metadata')
    .get() as { count: number };
  assert.equal(Number(count.count), 0);

  assert.throws(
    () =>
      database.connection
        .prepare(
          `INSERT INTO search_index_metadata(
             id, last_rebuilt_at, last_indexed_documents
           ) VALUES (?, ?, ?)`
        )
        .run(2, '2026-07-25T00:00:00.000Z', 1),
    /constraint/i
  );
  assert.throws(
    () =>
      database.connection
        .prepare(
          `INSERT INTO search_index_metadata(
             id, last_rebuilt_at, last_indexed_documents
           ) VALUES (?, ?, ?)`
        )
        .run(1, '2026-07-25T00:00:00.000Z', -1),
    /constraint/i
  );
});

test('repository reports current count and optional rebuild metadata', async (context) => {
  const database = databaseFixture(context);
  const repository = new SearchSqliteRepository(database);

  assert.equal(await repository.countDocuments(), 0);
  assert.equal(await repository.getIndexMetadata(), null);

  const result = await repository.replaceAllForRebuild(documents, '2026-07-25T02:30:00.000Z');

  assert.deepEqual(result, {
    indexedDocuments: 2,
    rebuiltAt: '2026-07-25T02:30:00.000Z'
  });
  assert.equal(await repository.countDocuments(), 2);
  assert.deepEqual(await repository.getIndexMetadata(), {
    lastRebuiltAt: '2026-07-25T02:30:00.000Z',
    lastIndexedDocuments: 2
  });
});

test('replaceAllForRebuild rolls documents and metadata back together', async (context) => {
  const database = databaseFixture(context);
  const repository = new SearchSqliteRepository(database);

  await repository.replaceAllForRebuild(documents, '2026-07-25T02:30:00.000Z');

  database.connection.exec(`
    CREATE TRIGGER reject_search_metadata_update
    BEFORE INSERT ON search_index_metadata
    BEGIN
      SELECT RAISE(ABORT, 'metadata stop');
    END;
  `);

  await assert.rejects(
    repository.replaceAllForRebuild([documents[0]!], '2026-07-25T03:30:00.000Z'),
    /metadata stop/
  );

  assert.equal(await repository.countDocuments(), 2);
  assert.deepEqual(await repository.getIndexMetadata(), {
    lastRebuiltAt: '2026-07-25T02:30:00.000Z',
    lastIndexedDocuments: 2
  });
});

test('zero-document rebuild is valid metadata', async (context) => {
  const database = databaseFixture(context);
  const repository = new SearchSqliteRepository(database);

  assert.deepEqual(await repository.replaceAllForRebuild([], '2026-07-25T04:30:00.000Z'), {
    indexedDocuments: 0,
    rebuiltAt: '2026-07-25T04:30:00.000Z'
  });
  assert.deepEqual(await repository.getIndexMetadata(), {
    lastRebuiltAt: '2026-07-25T04:30:00.000Z',
    lastIndexedDocuments: 0
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('maintenance status combines in-memory running state, live count, and metadata', async () => {
  const repository = {
    countDocuments: async () => 7,
    getIndexMetadata: async () => ({
      lastRebuiltAt: '2026-07-25T02:30:00.000Z',
      lastIndexedDocuments: 5
    }),
    replaceAllForRebuild: async () => {
      throw new Error('not used');
    }
  };
  const source = { listDocuments: async () => [] };
  const lifecycle = {
    started: async () => {},
    completed: async () => {},
    failed: async () => {}
  };

  const { SearchIndexMaintenanceService } =
    await import('../../apps/api/src/modules/search/application/services/search-index-maintenance.service.ts');

  const service = new SearchIndexMaintenanceService(source, repository as never, lifecycle, {
    now: () => new Date('2026-07-25T03:00:00.000Z')
  });

  assert.deepEqual(await service.getStatus(), {
    rebuildRunning: false,
    indexedDocuments: 7,
    lastRebuiltAt: '2026-07-25T02:30:00.000Z',
    lastIndexedDocuments: 5
  });
});

test('maintenance service rejects a concurrent rebuild and emits one lifecycle sequence', async () => {
  const gate = deferred<[]>();
  const calls: string[] = [];
  let replacements = 0;
  let runningAtCompleted: boolean | undefined;
  let service!: {
    getStatus(): Promise<{ rebuildRunning: boolean }>;
    rebuild(): Promise<{ indexedDocuments: number; rebuiltAt: string }>;
  };

  const source = { listDocuments: () => gate.promise };
  const repository = {
    countDocuments: async () => 0,
    getIndexMetadata: async () => null,
    replaceAllForRebuild: async (_documents: unknown[], rebuiltAt: string) => {
      replacements += 1;
      return { indexedDocuments: 0, rebuiltAt };
    }
  };
  const lifecycle = {
    started: async () => {
      calls.push('started');
    },
    completed: async () => {
      calls.push('completed');
      runningAtCompleted = (await service.getStatus()).rebuildRunning;
    },
    failed: async () => {
      calls.push('failed');
    }
  };

  const { SearchIndexMaintenanceService } =
    await import('../../apps/api/src/modules/search/application/services/search-index-maintenance.service.ts');
  const { SearchIndexRebuildConflictError } =
    await import('../../apps/api/src/modules/search/domain/search.error.ts');

  service = new SearchIndexMaintenanceService(source, repository as never, lifecycle, {
    now: () => new Date('2026-07-25T03:00:00.000Z')
  });

  const first = service.rebuild();
  assert.equal((await service.getStatus()).rebuildRunning, true);
  await assert.rejects(service.rebuild(), SearchIndexRebuildConflictError);

  gate.resolve([]);
  assert.deepEqual(await first, {
    indexedDocuments: 0,
    rebuiltAt: '2026-07-25T03:00:00.000Z'
  });
  assert.equal(replacements, 1);
  assert.deepEqual(calls, ['started', 'completed']);
  assert.equal(runningAtCompleted, false);
  assert.equal((await service.getStatus()).rebuildRunning, false);
});

test('maintenance service emits failed and clears running state after rebuild failure', async () => {
  const calls: string[] = [];
  let replacements = 0;
  let runningAtFailed: boolean | undefined;
  let service!: {
    getStatus(): Promise<{ rebuildRunning: boolean }>;
    rebuild(): Promise<{ indexedDocuments: number; rebuiltAt: string }>;
  };
  const failure = new Error('replace failed');

  const source = { listDocuments: async () => [] };
  const repository = {
    countDocuments: async () => 0,
    getIndexMetadata: async () => null,
    replaceAllForRebuild: async () => {
      replacements += 1;
      throw failure;
    }
  };
  const lifecycle = {
    started: async () => {
      calls.push('started');
    },
    completed: async () => {
      calls.push('completed');
    },
    failed: async () => {
      calls.push('failed');
      runningAtFailed = (await service.getStatus()).rebuildRunning;
    }
  };

  const { SearchIndexMaintenanceService } =
    await import('../../apps/api/src/modules/search/application/services/search-index-maintenance.service.ts');
  service = new SearchIndexMaintenanceService(source, repository as never, lifecycle, {
    now: () => new Date('2026-07-25T03:00:00.000Z')
  });

  await assert.rejects(service.rebuild(), failure);
  assert.equal(replacements, 1);
  assert.deepEqual(calls, ['started', 'failed']);
  assert.equal(runningAtFailed, false);
  assert.equal((await service.getStatus()).rebuildRunning, false);
});

test('Search HTTP exposes status and maps active rebuild to 409', async (context) => {
  const express = (await import('express')).default;
  const { createSearchRoutes } =
    await import('../../apps/api/src/modules/search/presentation/search.routes.ts');
  const { SearchController } =
    await import('../../apps/api/src/modules/search/presentation/search.controller.ts');
  const { SearchIndexRebuildConflictError } =
    await import('../../apps/api/src/modules/search/domain/search.error.ts');
  const { errorMiddleware } = await import('../../apps/api/src/platform/http/error.middleware.ts');

  const api = {
    queries: {
      search: async () => ({ query: '', total: 0, limit: 20, offset: 0, items: [] }),
      status: async () => ({
        rebuildRunning: true,
        indexedDocuments: 7,
        lastRebuiltAt: null,
        lastIndexedDocuments: null
      })
    },
    commands: {
      rebuild: async () => {
        throw new SearchIndexRebuildConflictError();
      }
    }
  };

  const app = express();
  app.use('/api/search', createSearchRoutes(new SearchController(api)));
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => server.close());

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const status = await fetch(`http://127.0.0.1:${address.port}/api/search/status`);
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as { data: { rebuildRunning: boolean } };
  assert.equal(statusBody.data.rebuildRunning, true);

  const conflict = await fetch(`http://127.0.0.1:${address.port}/api/search/rebuild`, {
    method: 'POST'
  });
  assert.equal(conflict.status, 409);
  const conflictBody = (await conflict.json()) as { error: { code: string } };
  assert.equal(conflictBody.error.code, 'CONFLICT');
});
