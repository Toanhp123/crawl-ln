import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'novel-tool-task-constraint-'));
process.env.STORAGE_DIR = storageDir;

const { NovelSqliteRepository } =
  await import('../../apps/api/src/modules/novels/infrastructure/sqlite/novel-sqlite.repository.ts');
const { NovelAnalysisSqliteAdapter } =
  await import('../../apps/api/src/modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.ts');
const { TaskSqliteRepository } =
  await import('../../apps/api/src/modules/task/infrastructure/sqlite/task-sqlite.repository.ts');
const { CrawlTaskEntity } =
  await import('../../apps/api/src/modules/task/domain/entities/task.entity.ts');
const { createSqliteDatabase } = await import('../../apps/api/src/shared/database/sqlite.ts');

const database = createSqliteDatabase(join(storageDir, 'constraint.sqlite'));
const analysis = new NovelAnalysisSqliteAdapter(database);
const tasks = new TaskSqliteRepository(database);
const now = '2026-07-16T00:00:00.000Z';

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
  []
);

test.after(async () => {
  database.close();
  await rm(storageDir, { recursive: true, force: true });
});

test('database rejects a second active crawl task for the same novel as a conflict', async () => {
  const first = CrawlTaskEntity.createQueued({
    id: 't1',
    novelId: 'n1',
    totalChapters: 1,
    now
  }).toPrimitives();
  const second = CrawlTaskEntity.createQueued({
    id: 't2',
    novelId: 'n1',
    totalChapters: 1,
    now
  }).toPrimitives();
  await tasks.create(first, []);
  await assert.rejects(
    () => tasks.create(second, []),
    (error: unknown) =>
      error instanceof Error &&
      error.name === 'TaskConflictError' &&
      /active crawl task/i.test(error.message)
  );
});
