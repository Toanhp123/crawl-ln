import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { createSqliteDatabase } = await import('../../apps/api/src/shared/database/sqlite.ts');
const { NovelSqliteRepository } =
  await import('../../apps/api/src/modules/novels/infrastructure/sqlite/novel-sqlite.repository.ts');
const { NovelAnalysisSqliteAdapter } =
  await import('../../apps/api/src/modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.ts');
const { ChapterSqliteRepository } =
  await import('../../apps/api/src/modules/chapters/infrastructure/sqlite/chapter-sqlite.repository.ts');
const { TaskSqliteRepository } =
  await import('../../apps/api/src/modules/task/infrastructure/sqlite/task-sqlite.repository.ts');
const { CrawlTaskEntity } =
  await import('../../apps/api/src/modules/task/domain/entities/task.entity.ts');
const { CrawlRunSqliteUnitOfWork } =
  await import('../../apps/api/src/shared/database/crawl-run-sqlite.unit-of-work.ts');
const { ChapterCrawlSqliteWriter } =
  await import('../../apps/api/src/modules/chapters/infrastructure/sqlite/chapter-crawl-sqlite.writer.ts');
const { TaskCrawlSqliteWriter } =
  await import('../../apps/api/src/modules/task/infrastructure/sqlite/task-crawl-sqlite.writer.ts');
const { NovelCrawlSqliteWriter } =
  await import('../../apps/api/src/modules/novels/infrastructure/sqlite/novel-crawl-sqlite.writer.ts');

const now = '2026-07-16T00:00:00.000Z';

function createCrawlPersistence(database: ReturnType<typeof createSqliteDatabase>) {
  return new CrawlRunSqliteUnitOfWork(
    database,
    new ChapterCrawlSqliteWriter(database),
    new TaskCrawlSqliteWriter(database),
    new NovelCrawlSqliteWriter(database)
  );
}

test('chapter and task progress roll back together when a persistence step fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-tool-transaction-'));
  const database = createSqliteDatabase(join(directory, 'transaction.sqlite'));
  const novels = new NovelSqliteRepository(database);
  const analysis = new NovelAnalysisSqliteAdapter(database);
  const chapters = new ChapterSqliteRepository(database);
  const tasks = new TaskSqliteRepository(database);

  try {
    await analysis.persist(
      {
        id: 'n1',
        title: 'Novel',
        sourceUrl: 'https://example.com/n1',
        sourceName: 'example',
        status: 'analyzed',
        createdAt: now,
        updatedAt: now,
        autoUpdateEnabled: false,
        updateIntervalMinutes: 1440,
        lastUpdateResult: 'idle',
        consecutiveUpdateFailures: 0
      },
      [
        {
          id: 'c1',
          novelId: 'n1',
          index: 1,
          title: 'Chapter 1',
          sourceUrl: 'https://example.com/c1',
          status: 'pending'
        }
      ]
    );
    const task = CrawlTaskEntity.createQueued({ id: 't1', novelId: 'n1', totalChapters: 1, now })
      .markRunning(now)
      .toPrimitives();
    await tasks.create(task, ['c1']);

    assert.throws(() =>
      database.transactionSync(() => {
        database.connection
          .prepare(
            `UPDATE chapters SET status='fetched', raw_text='raw', clean_text='clean' WHERE id='c1'`
          )
          .run();
        throw new Error('simulated task persistence failure');
      })
    );

    const chapter = await chapters.findByNovelAndIndex('n1', 1);
    const storedTask = await tasks.findById('t1');
    assert.equal(chapter?.status, 'pending');
    assert.equal(storedTask?.fetchedChapters, 0);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('independent database instances do not share state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-tool-db-factory-'));
  const first = createSqliteDatabase(join(directory, 'first.sqlite'));
  const second = createSqliteDatabase(join(directory, 'second.sqlite'));
  try {
    await new NovelAnalysisSqliteAdapter(first).persist(
      {
        id: 'n1',
        title: 'Only first',
        sourceUrl: 'https://example.com/first',
        sourceName: 'example',
        status: 'analyzed',
        createdAt: now,
        updatedAt: now,
        autoUpdateEnabled: false,
        updateIntervalMinutes: 1440,
        lastUpdateResult: 'idle',
        consecutiveUpdateFailures: 0
      },
      []
    );
    assert.equal((await new NovelSqliteRepository(first).findAll()).length, 1);
    assert.equal((await new NovelSqliteRepository(second).findAll()).length, 0);
  } finally {
    first.close();
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('final task and novel state roll back together when novel persistence fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-tool-final-transaction-'));
  const database = createSqliteDatabase(join(directory, 'final.sqlite'));
  const novels = new NovelSqliteRepository(database);
  const analysis = new NovelAnalysisSqliteAdapter(database);
  const tasks = new TaskSqliteRepository(database);
  const persistence = createCrawlPersistence(database);
  try {
    await analysis.persist(
      {
        id: 'n1',
        title: 'Novel',
        sourceUrl: 'https://example.com/n1',
        sourceName: 'example',
        status: 'crawling',
        createdAt: now,
        updatedAt: now,
        autoUpdateEnabled: false,
        updateIntervalMinutes: 1440,
        lastUpdateResult: 'idle',
        consecutiveUpdateFailures: 0
      },
      []
    );
    const running = CrawlTaskEntity.createQueued({ id: 't1', novelId: 'n1', totalChapters: 0, now })
      .markRunning(now)
      .toPrimitives();
    await tasks.create(running);
    database.connection.exec(
      `CREATE TRIGGER reject_novel_update BEFORE UPDATE ON novels BEGIN SELECT RAISE(ABORT, 'reject novel update'); END;`
    );
    const completed = CrawlTaskEntity.fromPrimitives(running)
      .complete('2026-07-16T00:01:00.000Z')
      .toPrimitives();
    const storedNovel = (await novels.findById('n1'))!;
    await assert.rejects(() =>
      persistence.persistFinal(completed, {
        ...storedNovel,
        status: 'completed',
        updatedAt: completed.updatedAt
      })
    );
    assert.equal((await tasks.findById('t1'))?.status, 'running');
    assert.equal((await novels.findById('n1'))?.status, 'crawling');
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration runner records every schema version in order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-tool-migrations-'));
  const database = createSqliteDatabase(join(directory, 'migrations.sqlite'));
  try {
    const versions = database.connection
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;
    assert.deepEqual(
      versions.map((row) => Number(row.version)),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    );
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('crawl persistence writes outcome and counters into their correct columns', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'novel-tool-persistence-columns-'));
  const database = createSqliteDatabase(join(dir, 'db.sqlite'));
  try {
    database.connection
      .prepare(
        `INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at,auto_update_enabled,update_interval_minutes,last_update_result,consecutive_update_failures) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'novel-1',
        'Novel',
        'https://example.com/novel-1',
        'example',
        'crawling',
        now,
        now,
        0,
        1440,
        'idle',
        0
      );
    database.connection
      .prepare(
        `INSERT INTO crawl_tasks(id,novel_id,status,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`
      )
      .run('task-columns', 'novel-1', 'running', 3, 1, 0, now, now);
    const adapter = createCrawlPersistence(database);
    await adapter.persistFinal(
      {
        id: 'task-columns',
        novelId: 'novel-1',
        status: 'completed',
        outcome: 'partial',
        totalChapters: 3,
        fetchedChapters: 2,
        failedChapters: 1,
        totalPausedMs: 100,
        currentSpeed: 0,
        averageSpeed: 2,
        etaSeconds: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        finishedAt: now
      },
      {
        id: 'novel-1',
        title: 'Novel',
        sourceUrl: 'https://example.com/novel-1',
        sourceName: 'example',
        status: 'completed',
        createdAt: now,
        updatedAt: now,
        autoUpdateEnabled: false,
        updateIntervalMinutes: 1440,
        lastUpdateResult: 'idle',
        consecutiveUpdateFailures: 0
      }
    );
    const row = database.connection
      .prepare(
        `SELECT status,outcome,total_chapters,fetched_chapters,failed_chapters,total_paused_ms,average_speed,eta_seconds FROM crawl_tasks WHERE id=?`
      )
      .get('task-columns') as Record<string, unknown>;
    assert.deepEqual(
      { ...row },
      {
        status: 'completed',
        outcome: 'partial',
        total_chapters: 3,
        fetched_chapters: 2,
        failed_chapters: 1,
        total_paused_ms: 100,
        average_speed: 2,
        eta_seconds: 0
      }
    );
  } finally {
    database.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('reanalyzing a novel preserves content only for stable source URLs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novel-tool-reconcile-'));
  const database = createSqliteDatabase(join(directory, 'reconcile.sqlite'));
  const analysis = new NovelAnalysisSqliteAdapter(database);
  const chapters = new ChapterSqliteRepository(database);
  try {
    const novel = {
      id: 'n-reconcile',
      title: 'Novel',
      sourceUrl: 'https://example.com/reconcile',
      sourceName: 'example',
      status: 'analyzed' as const,
      createdAt: now,
      updatedAt: now,
      autoUpdateEnabled: false,
      updateIntervalMinutes: 1440 as const,
      lastUpdateResult: 'idle' as const,
      consecutiveUpdateFailures: 0
    };
    await analysis.persist(novel, [
      {
        id: 'chapter-stable',
        novelId: novel.id,
        index: 1,
        title: 'Old title',
        sourceUrl: 'https://example.com/reconcile/1',
        status: 'fetched',
        rawText: 'raw',
        cleanText: 'preserved'
      }
    ]);
    await analysis.persist({ ...novel, updatedAt: '2026-07-16T00:05:00.000Z' }, [
      {
        id: 'incoming-id-is-ignored',
        novelId: novel.id,
        index: 1,
        title: 'Updated title',
        sourceUrl: 'https://example.com/reconcile/1-new',
        status: 'pending'
      },
      {
        id: 'chapter-new',
        novelId: novel.id,
        index: 2,
        title: 'Chapter 2',
        sourceUrl: 'https://example.com/reconcile/2',
        status: 'pending'
      }
    ]);
    const storedChapters = await chapters.listByNovelId(novel.id);
    assert.equal(storedChapters.length, 2);
    assert.deepEqual(storedChapters[0], {
      id: 'incoming-id-is-ignored',
      novelId: novel.id,
      index: 1,
      title: 'Updated title',
      sourceUrl: 'https://example.com/reconcile/1-new',
      status: 'pending',
      rawText: undefined,
      cleanText: undefined,
      errorMessage: undefined,
      contentVersion: 1
    });
    const orphan = database.connection
      .prepare('SELECT source_available, clean_text FROM chapters WHERE id = ?')
      .get('chapter-stable') as { source_available: number; clean_text: string };
    assert.equal(orphan.source_available, 0);
    assert.equal(orphan.clean_text, 'preserved');
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
