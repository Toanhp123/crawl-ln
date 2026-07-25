import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Search Index state maps ready and rebuilding without color-only meaning', async () => {
  const { getSearchIndexDisplayState } =
    await import('../../apps/web/src/features/rebuild-search-index/model/search-index-presentation.ts');

  assert.deepEqual(getSearchIndexDisplayState({ rebuildRunning: false }), {
    key: 'ready',
    tone: 'success'
  });
  assert.deepEqual(getSearchIndexDisplayState({ rebuildRunning: true }), {
    key: 'rebuilding',
    tone: 'info'
  });
});

test('shared relative timestamp formatting is deterministic when a timezone is supplied', async () => {
  const { formatRelativeTimestamp } =
    await import('../../apps/web/src/shared/lib/format-relative-timestamp.ts');

  const now = Date.parse('2026-07-25T03:00:00.000Z');
  const result = formatRelativeTimestamp('2026-07-25T02:58:00.000Z', {
    locale: 'en-US',
    now,
    timeZone: 'UTC'
  });

  assert.ok(result);
  assert.equal(result.relative, '2 minutes ago');
  assert.match(result.absolute, /Jul 25, 2026/);
  assert.match(result.absolute, /2:58 AM|02:58/);
  assert.equal(formatRelativeTimestamp(null, { locale: 'en-US', now }), null);
  assert.equal(formatRelativeTimestamp('bad-date', { locale: 'en-US', now }), null);
});

test('SearchIndexStatusList owns four semantic rows and refreshes relative time locally', async () => {
  const source = await readFile(
    'apps/web/src/features/rebuild-search-index/ui/SearchIndexStatusList.tsx',
    'utf8'
  );

  assert.match(source, /StatusList/);
  assert.match(source, /getSearchIndexDisplayState/);
  assert.match(source, /formatRelativeTimestamp/);
  assert.match(source, /setInterval/);
  assert.match(source, /currentDocuments/);
  assert.match(source, /lastRebuildDocuments/);
  assert.doesNotMatch(source, /useSearchIndexStatus|useRebuildSearchIndex/);
});

test('Scheduler keeps its public timestamp formatter through the shared implementation', async () => {
  const source = await readFile(
    'apps/web/src/features/run-scheduler/model/scheduler-time.ts',
    'utf8'
  );
  assert.match(source, /formatRelativeTimestamp as formatSchedulerTimestamp/);
  assert.match(source, /RelativeTimestampDisplay as SchedulerTimeDisplay/);
});
