import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { HttpContractRuntime } from './http-contract.types.ts';
import { withContractServer } from './http-server.harness.ts';

const createdAt = '2026-07-21T08:00:00.000Z';
const startedAt = '2026-07-21T08:01:00.000Z';
const finishedAt = '2026-07-21T08:02:00.000Z';
const nextCheckAt = '2026-07-22T08:00:00.000Z';

function seedCurrentDatabase(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database
      .prepare(
        `INSERT INTO novels(
           id, title, source_url, source_name, status, created_at, updated_at,
           auto_update_enabled, update_interval_minutes, last_update_check_at,
           next_update_check_at, last_update_result, consecutive_update_failures
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'novel-1',
        'Dragon Book',
        'https://fixture.test/novel-1',
        'fixture',
        'completed',
        createdAt,
        finishedAt,
        1,
        1440,
        finishedAt,
        nextCheckAt,
        'up_to_date',
        0
      );
    const chapter = database.prepare(
      `INSERT INTO chapters(
         id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status,
         error_message, source_available, content_version
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    );
    chapter.run(
      'chapter-1',
      'novel-1',
      1,
      'Chapter One',
      'https://fixture.test/novel-1/chapter-1',
      '<p>Raw one</p>',
      'Clean one',
      'fetched',
      null,
      1,
      2
    );
    chapter.run(
      'chapter-2',
      'novel-1',
      2,
      'Chapter Two',
      'https://fixture.test/novel-1/chapter-2',
      '<p>Raw two</p>',
      'Clean two',
      'fetched',
      null,
      1,
      1
    );
    database
      .prepare(
        `INSERT INTO crawl_tasks(
           id, novel_id, status, outcome, total_chapters, fetched_chapters,
           failed_chapters, error_message, started_at, finished_at, paused_at,
           total_paused_ms, current_speed, average_speed, eta_seconds,
           created_at, updated_at, chapter_ids_json
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'task-1',
        'novel-1',
        'completed',
        'partial',
        2,
        1,
        1,
        null,
        startedAt,
        finishedAt,
        null,
        0,
        0,
        1.5,
        null,
        createdAt,
        finishedAt,
        JSON.stringify(['chapter-1', 'chapter-2'])
      );
    database
      .prepare(
        `INSERT INTO crawl_events(
           id, task_id, type, level, message, chapter_id, chapter_index,
           chapter_title, attempt, created_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'event-1',
        'task-1',
        'completed',
        'warning',
        'Crawl completed with failures',
        null,
        null,
        null,
        null,
        finishedAt
      );
  } finally {
    database.close();
  }
}

function seedNextDatabase(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database
      .prepare(
        `INSERT INTO library_novels(
           id, title, source_url, source_name, status, created_at, updated_at
         ) VALUES(?,?,?,?,?,?,?)`
      )
      .run(
        'novel-1',
        'Dragon Book',
        'https://fixture.test/novel-1',
        'fixture',
        'completed',
        createdAt,
        finishedAt
      );
    const chapter = database.prepare(
      `INSERT INTO library_chapters(
         id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status,
         error_message, source_available, content_version, created_at, updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    chapter.run(
      'chapter-1',
      'novel-1',
      1,
      'Chapter One',
      'https://fixture.test/novel-1/chapter-1',
      '<p>Raw one</p>',
      'Clean one',
      'fetched',
      null,
      1,
      2,
      createdAt,
      finishedAt
    );
    chapter.run(
      'chapter-2',
      'novel-1',
      2,
      'Chapter Two',
      'https://fixture.test/novel-1/chapter-2',
      '<p>Raw two</p>',
      'Clean two',
      'fetched',
      null,
      1,
      1,
      createdAt,
      finishedAt
    );
    database
      .prepare(
        `INSERT INTO ingestion_jobs(
           id, novel_id, status, outcome, total_chapters, fetched_chapters,
           failed_chapters, error_message, started_at, finished_at, paused_at,
           total_paused_ms, current_speed, average_speed, eta_seconds, created_at, updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'task-1',
        'novel-1',
        'completed',
        'partial',
        2,
        1,
        1,
        null,
        startedAt,
        finishedAt,
        null,
        0,
        0,
        1.5,
        null,
        createdAt,
        finishedAt
      );
    database
      .prepare(
        `INSERT INTO ingestion_events(
           id, job_id, type, level, message, chapter_id, chapter_index,
           chapter_title, attempt, created_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        'event-1',
        'task-1',
        'completed',
        'warning',
        'Crawl completed with failures',
        null,
        null,
        null,
        null,
        finishedAt
      );
    database
      .prepare(
        `INSERT INTO scheduler_policies(
           novel_id, enabled, interval_minutes, last_check_at, next_check_at,
           last_result, consecutive_failures, created_at, updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?)`
      )
      .run('novel-1', 1, 1440, finishedAt, nextCheckAt, 'up_to_date', 0, createdAt, finishedAt);
  } finally {
    database.close();
  }
}

const currentRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-current-library-http-'));
    const previousStorage = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = storageDirectory;
    try {
      const { createAppRuntime } = await import('../../apps/api-legacy/src/app.ts');
      const runtime = createAppRuntime({ startBackgroundServices: false });
      await runtime.ready;
      seedCurrentDatabase(join(storageDirectory, 'novel-tool.sqlite'));
      return {
        app: runtime.app,
        async close() {
          try {
            await runtime.lifecycle.stop();
          } finally {
            await rm(storageDirectory, { recursive: true, force: true });
          }
        }
      };
    } finally {
      if (previousStorage === undefined) delete process.env.STORAGE_DIR;
      else process.env.STORAGE_DIR = previousStorage;
    }
  }
};

const nextRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-next-library-http-'));
    const { createEnvironment } = await import('../../apps/api/src/platform/config/environment.ts');
    const { createAppRuntime } = await import('../../apps/api/src/app.ts');
    const environment = createEnvironment({
      ...process.env,
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    const runtime = createAppRuntime({ environment });
    await runtime.ready;
    seedNextDatabase(environment.databasePath);
    return {
      app: runtime.app,
      async close() {
        try {
          await runtime.lifecycle.stop();
        } finally {
          await rm(storageDirectory, { recursive: true, force: true });
        }
      }
    };
  }
};

const expectedNovel = {
  id: 'novel-1',
  title: 'Dragon Book',
  sourceUrl: 'https://fixture.test/novel-1',
  sourceName: 'fixture',
  status: 'completed',
  createdAt,
  updatedAt: finishedAt,
  autoUpdateEnabled: true,
  updateIntervalMinutes: 1440,
  lastUpdateCheckAt: finishedAt,
  nextUpdateCheckAt: nextCheckAt,
  lastUpdateResult: 'up_to_date',
  consecutiveUpdateFailures: 0,
  chapterCount: 2,
  fetchedChapterCount: 2,
  failedChapterCount: 0,
  firstChapterIndex: 1
};

const expectedNovelDetail = {
  id: expectedNovel.id,
  title: expectedNovel.title,
  sourceUrl: expectedNovel.sourceUrl,
  sourceName: expectedNovel.sourceName,
  status: expectedNovel.status,
  createdAt: expectedNovel.createdAt,
  updatedAt: expectedNovel.updatedAt,
  autoUpdateEnabled: expectedNovel.autoUpdateEnabled,
  updateIntervalMinutes: expectedNovel.updateIntervalMinutes,
  lastUpdateCheckAt: expectedNovel.lastUpdateCheckAt,
  nextUpdateCheckAt: expectedNovel.nextUpdateCheckAt,
  lastUpdateResult: expectedNovel.lastUpdateResult,
  consecutiveUpdateFailures: expectedNovel.consecutiveUpdateFailures
};

const expectedChapters = [
  {
    id: 'chapter-1',
    novelId: 'novel-1',
    index: 1,
    title: 'Chapter One',
    sourceUrl: 'https://fixture.test/novel-1/chapter-1',
    rawText: '<p>Raw one</p>',
    cleanText: 'Clean one',
    status: 'fetched',
    contentVersion: 2
  },
  {
    id: 'chapter-2',
    novelId: 'novel-1',
    index: 2,
    title: 'Chapter Two',
    sourceUrl: 'https://fixture.test/novel-1/chapter-2',
    rawText: '<p>Raw two</p>',
    cleanText: 'Clean two',
    status: 'fetched',
    contentVersion: 1
  }
];

const expectedTask = {
  id: 'task-1',
  novelId: 'novel-1',
  status: 'completed',
  outcome: 'partial',
  totalChapters: 2,
  fetchedChapters: 1,
  failedChapters: 1,
  startedAt,
  finishedAt,
  totalPausedMs: 0,
  currentSpeed: 0,
  averageSpeed: 1.5,
  createdAt,
  updatedAt: finishedAt
};

async function expectData(baseUrl: string, path: string, expected: unknown): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, path);
  assert.deepEqual(await response.json(), { data: expected, error: null });
}

async function assertLibraryIngestionContract(baseUrl: string): Promise<void> {
  await expectData(baseUrl, '/api/novels?limit=10&offset=0&status=all&sort=recent', {
    items: [expectedNovel],
    total: 1,
    limit: 10,
    offset: 0
  });
  await expectData(baseUrl, '/api/novels/stats', {
    novels: 1,
    analyzed: 0,
    crawling: 0,
    completed: 1,
    failed: 0
  });
  await expectData(baseUrl, '/api/novels/novel-1', {
    novel: expectedNovelDetail,
    chapters: expectedChapters
  });
  await expectData(baseUrl, '/api/novels/novel-1/chapters', expectedChapters);
  await expectData(baseUrl, '/api/novels/novel-1/chapters/1', expectedChapters[0]);
  await expectData(baseUrl, '/api/novels/novel-1/task', expectedTask);
  await expectData(baseUrl, '/api/tasks', [expectedTask]);
  await expectData(baseUrl, '/api/tasks/summary', { activeCount: 0 });
  await expectData(baseUrl, '/api/tasks/task-1', expectedTask);
  await expectData(baseUrl, '/api/crawl/jobs/task-1/events?limit=10', [
    {
      id: 'event-1',
      taskId: 'task-1',
      type: 'completed',
      level: 'warning',
      message: 'Crawl completed with failures',
      createdAt: finishedAt
    }
  ]);
  await expectData(baseUrl, '/api/novels/missing/chapters', []);
  await expectData(baseUrl, '/api/novels/missing/task', null);

  for (const [path, message] of [
    ['/api/novels/missing', 'Novel not found'],
    ['/api/novels/novel-1/chapters/99', 'Chapter not found'],
    ['/api/tasks/missing', 'Task not found'],
    ['/api/crawl/jobs/missing/events', 'Crawl job not found']
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), {
      data: null,
      error: { code: 'NOT_FOUND', message, details: null }
    });
  }

  for (const path of ['/api/novels/analyze', '/api/crawl/analyze'] as const) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url' })
    });
    assert.equal(response.status, 400, path);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      'VALIDATION_ERROR'
    );
  }

  const noPending = await fetch(`${baseUrl}/api/crawl/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ novelId: 'novel-1' })
  });
  assert.equal(noPending.status, 409);
  assert.deepEqual(await noPending.json(), {
    data: null,
    error: { code: 'CONFLICT', message: 'No pending chapters to crawl', details: null }
  });

  const missingJobNovel = await fetch(`${baseUrl}/api/crawl/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ novelId: 'missing' })
  });
  assert.equal(missingJobNovel.status, 404);
  assert.deepEqual(await missingJobNovel.json(), {
    data: null,
    error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }
  });

  const resumed = await fetch(`${baseUrl}/api/crawl/jobs/resume?limit=20`, { method: 'POST' });
  assert.equal(resumed.status, 202);
  assert.deepEqual(await resumed.json(), { data: [], error: null });

  for (const [method, path, action] of [
    ['POST', '/api/crawl/jobs/task-1/pause', 'pause'],
    ['POST', '/api/crawl/jobs/task-1/resume', 'resume'],
    ['DELETE', '/api/crawl/jobs/task-1', 'cancel']
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, { method });
    assert.equal(response.status, 409, path);
    assert.deepEqual(await response.json(), {
      data: null,
      error: {
        code: 'CONFLICT',
        message: `Cannot ${action} a completed crawl job`,
        details: null
      }
    });
  }

  const missingUpdate = await fetch(`${baseUrl}/api/novels/missing/update`, { method: 'POST' });
  assert.equal(missingUpdate.status, 404);
  assert.deepEqual(await missingUpdate.json(), {
    data: null,
    error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }
  });
}

for (const [name, runtime] of [
  ['current', currentRuntime],
  ['next', nextRuntime]
] as const) {
  test(`${name} API preserves library, chapter, task and crawl-event HTTP contracts`, async () => {
    await withContractServer(runtime, assertLibraryIngestionContract);
  });
}
