import assert from 'node:assert/strict';
import test from 'node:test';
import { createSchedulerModule } from '../../apps/api/src/modules/scheduler/scheduler.module.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { InMemoryEventBus } from '../../apps/api/src/platform/events/in-memory-event-bus.ts';

const now = new Date('2026-07-21T08:00:00.000Z');
const novel = {
  id: 'novel-1',
  title: 'Scheduler Fixture',
  sourceUrl: 'https://fixture.test/novel-1',
  sourceName: 'fixture',
  status: 'completed' as const,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T01:00:00.000Z'
};

function chapters(count: number) {
  return Array.from({ length: count }, (_, offset) => ({
    id: `chapter-${offset + 1}`,
    novelId: novel.id,
    index: offset + 1,
    title: `Chapter ${offset + 1}`,
    sourceUrl: `${novel.sourceUrl}/chapter-${offset + 1}`,
    status: 'pending' as const,
    sourceAvailable: true,
    contentVersion: 0,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt
  }));
}

function fixture(
  options: {
    beforeChapters?: number;
    afterChapters?: number;
    refreshDurationMs?: number;
    refreshError?: Error & { code?: string };
  } = {}
) {
  const database = new SqliteDatabase(':memory:');
  database.connection.exec(`
    CREATE TABLE library_novels (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );
    INSERT INTO library_novels(id, updated_at)
    VALUES ('novel-1', '2026-07-20T01:00:00.000Z');
  `);
  const refreshCalls: Array<{ commandId: string; novelId: string; requestedAt: string }> = [];
  const logs: string[] = [];
  let sequence = 0;
  let currentTime = now.getTime();
  const scheduler = createSchedulerModule({
    database,
    library: {
      getNovel: async (id: string) =>
        id === novel.id
          ? {
              novel,
              chapters: chapters(
                refreshCalls.length > 0
                  ? (options.afterChapters ?? options.beforeChapters ?? 0)
                  : (options.beforeChapters ?? 0)
              )
            }
          : null
    } as never,
    ingestion: {
      refreshNovel: async (command: {
        commandId: string;
        novelId: string;
        requestedAt: string;
      }) => {
        refreshCalls.push(command);
        currentTime += options.refreshDurationMs ?? 0;
        if (options.refreshError) throw options.refreshError;
        return { id: 'job-1', novelId: command.novelId, totalChapters: 2 } as never;
      }
    },
    events: new InMemoryEventBus(),
    clock: { now: () => new Date(currentTime) },
    ids: { randomId: () => `scheduler-${++sequence}` },
    logger: { error: (message) => logs.push(message) },
    tickIntervalMs: 60_000
  });
  for (const migration of scheduler.migrations) migration.up(database.connection);

  return { database, scheduler, refreshCalls, logs };
}

test('scheduler changes policy without updating library tables', async (t) => {
  const { database, scheduler } = fixture();
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();

  const updated = await scheduler.api.commands.updatePolicy({
    novelId: novel.id,
    enabled: true,
    intervalMinutes: 360
  });

  const policy = database.connection
    .prepare(
      `SELECT novel_id, enabled, interval_minutes, next_check_at
       FROM scheduler_policies WHERE novel_id=?`
    )
    .get(novel.id) as {
    novel_id: string;
    enabled: number;
    interval_minutes: number;
    next_check_at: string | null;
  };
  const libraryRow = database.connection
    .prepare('SELECT updated_at FROM library_novels WHERE id=?')
    .get(novel.id) as { updated_at: string };

  assert.equal(policy.novel_id, novel.id);
  assert.equal(policy.enabled, 1);
  assert.equal(policy.interval_minutes, 360);
  assert.equal(policy.next_check_at, now.toISOString());
  assert.equal(libraryRow.updated_at, novel.updatedAt);
  assert.equal(updated.autoUpdateEnabled, true);
  assert.equal(updated.updateIntervalMinutes, 360);
});

test('due tick calls Ingestion refresh and records diagnostics', async (t) => {
  const { database, scheduler, refreshCalls } = fixture();
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();
  await scheduler.api.commands.updatePolicy({
    novelId: novel.id,
    enabled: true,
    intervalMinutes: 360
  });

  await scheduler.api.lifecycle.tick();

  assert.deepEqual(refreshCalls, [
    {
      commandId: `scheduler-refresh:${novel.id}:${now.toISOString()}`,
      novelId: novel.id,
      requestedAt: now.toISOString()
    }
  ]);
  const diagnostics = await scheduler.api.queries.listDiagnostics(novel.id);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.result, 'queued');
  assert.equal(diagnostics[0]?.pendingChapterCount, 2);

  const policy = database.connection
    .prepare(
      `SELECT next_check_at, last_result, consecutive_failures
       FROM scheduler_policies WHERE novel_id=?`
    )
    .get(novel.id) as {
    next_check_at: string;
    last_result: string;
    consecutive_failures: number;
  };
  assert.equal(policy.next_check_at, '2026-07-21T14:00:00.000Z');
  assert.equal(policy.last_result, 'queued');
  assert.equal(policy.consecutive_failures, 0);
});

test('scheduler rejects policy changes for missing library novels', async (t) => {
  const { database, scheduler } = fixture();
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();

  await assert.rejects(
    () =>
      scheduler.api.commands.updatePolicy({
        novelId: 'missing',
        enabled: true,
        intervalMinutes: 360
      }),
    (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'not_found'
  );
});

test('scheduler diagnostics report chapters discovered by refresh', async (t) => {
  const { database, scheduler } = fixture({ beforeChapters: 1, afterChapters: 3 });
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();
  await scheduler.api.commands.updatePolicy({
    novelId: novel.id,
    enabled: true,
    intervalMinutes: 360
  });

  await scheduler.api.lifecycle.tick();

  const diagnostics = await scheduler.api.queries.listDiagnostics(novel.id);
  assert.equal(diagnostics[0]?.newChapterCount, 2);
  assert.equal(diagnostics[0]?.message, 'Queued 2 chapter(s), including 2 new.');
});

test('scheduler diagnostics record refresh duration', async (t) => {
  const { database, scheduler } = fixture({ refreshDurationMs: 250 });
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();
  await scheduler.api.commands.updatePolicy({
    novelId: novel.id,
    enabled: true,
    intervalMinutes: 360
  });

  await scheduler.api.lifecycle.tick();

  const diagnostics = await scheduler.api.queries.listDiagnostics(novel.id);
  assert.equal(diagnostics[0]?.durationMs, 250);
});

test('scheduler treats an active ingestion job as a skipped update', async (t) => {
  const conflict = Object.assign(new Error('active ingestion job'), {
    code: 'INGESTION_ACTIVE_JOB_CONFLICT'
  });
  const { database, scheduler, logs } = fixture({ refreshError: conflict });
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();
  await scheduler.api.commands.updatePolicy({
    novelId: novel.id,
    enabled: true,
    intervalMinutes: 360
  });

  await scheduler.api.lifecycle.tick();

  const diagnostics = await scheduler.api.queries.listDiagnostics(novel.id);
  assert.equal(diagnostics[0]?.result, 'skipped_active_task');
  assert.equal(logs.length, 0);
});

test('scheduler records non-active ingestion conflicts as failures', async (t) => {
  const conflict = Object.assign(new Error('ingestion queue is stopping'), {
    code: 'INGESTION_CONFLICT'
  });
  const { database, scheduler, logs } = fixture({ refreshError: conflict });
  t.after(async () => {
    await scheduler.stop();
    database.close();
  });
  await scheduler.start();
  await scheduler.api.commands.updatePolicy({
    novelId: novel.id,
    enabled: true,
    intervalMinutes: 360
  });

  await scheduler.api.lifecycle.tick();

  const diagnostics = await scheduler.api.queries.listDiagnostics(novel.id);
  assert.equal(diagnostics[0]?.result, 'failed');
  assert.match(logs[0] ?? '', /queue is stopping/i);
});
