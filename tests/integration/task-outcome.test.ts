import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteDatabase } from '../../apps/api-legacy/src/shared/database/sqlite.ts';
import { CrawlTaskEntity } from '../../apps/api-legacy/src/modules/task/domain/entities/task.entity.ts';

test('crawl task completion derives success partial and failure outcomes', () => {
  const base = CrawlTaskEntity.createQueued({
    id: 't',
    novelId: 'n',
    totalChapters: 2,
    now: '2026-01-01T00:00:00.000Z'
  }).markRunning('2026-01-01T00:00:01.000Z');
  const success = base
    .recordChapterResult(
      true,
      false,
      { currentSpeed: 1, averageSpeed: 1 },
      '2026-01-01T00:00:02.000Z'
    )
    .complete('2026-01-01T00:00:03.000Z')
    .toPrimitives();
  assert.equal(success.outcome, 'success');

  const partial = base
    .recordChapterResult(
      true,
      false,
      { currentSpeed: 1, averageSpeed: 1 },
      '2026-01-01T00:00:02.000Z'
    )
    .recordChapterResult(
      false,
      false,
      { currentSpeed: 1, averageSpeed: 1 },
      '2026-01-01T00:00:03.000Z'
    )
    .complete('2026-01-01T00:00:04.000Z')
    .toPrimitives();
  assert.equal(partial.status, 'completed');
  assert.equal(partial.outcome, 'partial');

  const failure = base
    .recordChapterResult(
      false,
      false,
      { currentSpeed: 1, averageSpeed: 1 },
      '2026-01-01T00:00:02.000Z'
    )
    .complete('2026-01-01T00:00:03.000Z')
    .toPrimitives();
  assert.equal(failure.status, 'failed');
  assert.equal(failure.outcome, 'failure');
});

test('migration 7 backfills outcomes for existing terminal tasks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'novel-tool-outcome-'));
  const path = join(dir, 'db.sqlite');
  const db = new SqliteDatabase(path);
  db.migrate();
  db.connection
    .prepare(
      `INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at) VALUES ('n','N','https://example.com/n','example','completed','x','x')`
    )
    .run();
  db.connection
    .prepare(
      `INSERT INTO crawl_tasks(id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at,chapter_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run('s', 'n', 'completed', null, 1, 1, 0, 'x', 'x', '[]');
  db.connection
    .prepare(
      `INSERT INTO crawl_tasks(id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at,chapter_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run('p', 'n', 'completed', null, 2, 1, 1, 'x', 'x', '[]');
  db.connection
    .prepare(
      `INSERT INTO crawl_tasks(id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at,chapter_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run('f', 'n', 'failed', null, 1, 0, 1, 'x', 'x', '[]');
  db.connection.exec(
    `UPDATE crawl_tasks SET outcome = CASE WHEN status = 'completed' AND failed_chapters = 0 THEN 'success' WHEN status = 'completed' AND failed_chapters > 0 THEN 'partial' WHEN status = 'failed' THEN 'failure' ELSE NULL END WHERE outcome IS NULL;`
  );
  const rows = db.connection
    .prepare(`SELECT id,outcome FROM crawl_tasks ORDER BY id`)
    .all() as Array<{ id: string; outcome: string }>;
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.outcome])), {
    f: 'failure',
    p: 'partial',
    s: 'success'
  });
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
