import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { importV22Database } from '../../apps/api/src/platform/migration/v22-importer.ts';
import { createV22Fixture } from '../helpers/v22-database.fixture.ts';

test('v22 importer preserves module records and rebuilds search', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v22-import-'));
  const fixture = await createV22Fixture(root);
  const targetPath = join(root, 'candidate.sqlite');
  const sourceBefore = await readFile(fixture.databasePath);

  const report = await importV22Database({
    sourcePath: fixture.databasePath,
    targetPath
  });

  assert.equal(report.valid, true);
  assert.equal(report.sourceSchemaVersion, 22);
  assert.deepEqual(report.ids, fixture.ids);
  assert.deepEqual(report.counts, fixture.counts);
  assert.equal(report.validation.idsPreserved, true);
  assert.equal(report.validation.timestampsPreserved, true);
  assert.equal(report.validation.searchRebuilt, true);
  assert.match(report.validation.chapterContentSha256, /^[a-f0-9]{64}$/);
  assert.match(report.validation.taskOutcomeSha256, /^[a-f0-9]{64}$/);
  assert.match(report.validation.sourceReaderMetadataSha256, /^[a-f0-9]{64}$/);
  assert.match(report.validation.schedulerPolicySha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readFile(fixture.databasePath), sourceBefore);

  const target = new DatabaseSync(targetPath, { readOnly: true });
  try {
    assert.equal(
      (
        target
          .prepare('SELECT clean_text FROM library_chapters WHERE id = ?')
          .get(fixture.ids.chapterId) as { clean_text: string }
      ).clean_text,
      'Fixture chapter content.'
    );
    assert.deepEqual(
      {
        ...(target
          .prepare('SELECT status, outcome FROM ingestion_jobs WHERE id = ?')
          .get(fixture.ids.taskId) as { status: string; outcome: string })
      },
      { status: 'completed', outcome: 'success' }
    );
    assert.deepEqual(
      {
        ...(target
          .prepare(
            `SELECT enabled, interval_minutes, last_result
             FROM scheduler_policies WHERE novel_id = ?`
          )
          .get(fixture.ids.novelId) as {
          enabled: number;
          interval_minutes: number;
          last_result: string;
        })
      },
      { enabled: 1, interval_minutes: 1440, last_result: 'up_to_date' }
    );
    assert.equal(
      Number(
        (
          target
            .prepare(
              `SELECT COUNT(*) AS count FROM source_reader_plugin_versions
               WHERE plugin_id = ?`
            )
            .get(fixture.ids.pluginId) as { count: number }
        ).count
      ),
      1
    );
    assert.equal(
      Number(
        (
          target
            .prepare(
              "SELECT COUNT(*) AS count FROM search_documents WHERE search_documents MATCH 'Fixture'"
            )
            .get() as { count: number }
        ).count
      ),
      2
    );
  } finally {
    target.close();
  }
});

test('failed v22 validation leaves an existing target untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v22-invalid-'));
  const fixture = await createV22Fixture(root);
  const source = new DatabaseSync(fixture.databasePath);
  try {
    source.exec('PRAGMA foreign_keys = OFF;');
    source
      .prepare(
        `INSERT INTO chapters(
           id, novel_id, chapter_index, title, source_url, status, source_available,
           content_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'orphan-chapter',
        'missing-novel',
        99,
        'Orphan',
        'https://fixture.test/orphan',
        'pending',
        1,
        1
      );
  } finally {
    source.close();
  }
  const targetPath = join(root, 'production.sqlite');
  const marker = Buffer.from('original-target');
  await writeFile(targetPath, marker);

  await assert.rejects(
    () => importV22Database({ sourcePath: fixture.databasePath, targetPath }),
    /validation failed/i
  );
  assert.deepEqual(await readFile(targetPath), marker);
});
