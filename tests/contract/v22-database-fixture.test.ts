import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createV22Fixture } from '../helpers/v22-database.fixture.ts';

test('v22 fixture contains stable library, ingestion, scheduler and source-reader records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v22-fixture-'));
  const fixture = await createV22Fixture(root);
  assert.equal(fixture.schemaVersion, 22);
  assert.deepEqual(fixture.ids, {
    novelId: 'fixture-novel',
    chapterId: 'fixture-chapter',
    taskId: 'fixture-task',
    pluginId: 'fixture-plugin'
  });
  assert.deepEqual(fixture.counts, { novels: 1, chapters: 1, tasks: 1, plugins: 1 });
});
