import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

test('database rejects invalid statuses and task counters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'novel-tool-integrity-'));
  const db = createSqliteDatabase(join(dir, 'db.sqlite'));
  try {
    assert.throws(
      () =>
        db.connection
          .prepare(
            `INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`
          )
          .run(
            'n',
            'N',
            'https://example.com/n',
            'x',
            'banana',
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z'
          ),
      /invalid novel status/
    );
    db.connection
      .prepare(
        `INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`
      )
      .run(
        'n',
        'N',
        'https://example.com/n',
        'x',
        'completed',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      );
    assert.throws(
      () =>
        db.connection
          .prepare(
            `INSERT INTO crawl_tasks(id,novel_id,status,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`
          )
          .run(
            't',
            'n',
            'running',
            1,
            2,
            0,
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z'
          ),
      /invalid task counters/
    );
    assert.throws(
      () =>
        db.connection
          .prepare(
            `INSERT INTO crawl_tasks(id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`
          )
          .run(
            't2',
            'n',
            'completed',
            'failure',
            1,
            1,
            0,
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z'
          ),
      /completed task requires success or partial outcome/
    );
    assert.throws(
      () =>
        db.connection
          .prepare(
            `INSERT INTO crawl_tasks(id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`
          )
          .run(
            't3',
            'n',
            'failed',
            'success',
            1,
            0,
            1,
            '2026-01-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z'
          ),
      /failed task requires failure outcome/
    );
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
