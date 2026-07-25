import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Search status polling is disabled with realtime and dynamic when disconnected', async () => {
  const { searchIndexFallbackInterval } =
    await import('../../apps/web/src/entities/search/api/search-queries.ts');

  assert.equal(searchIndexFallbackInterval('connected', undefined, true), false);
  assert.equal(searchIndexFallbackInterval('disconnected', undefined, true), 15_000);
  assert.equal(
    searchIndexFallbackInterval(
      'disconnected',
      {
        rebuildRunning: false,
        indexedDocuments: 3,
        lastRebuiltAt: null,
        lastIndexedDocuments: null
      },
      true
    ),
    15_000
  );
  assert.equal(
    searchIndexFallbackInterval(
      'disconnected',
      {
        rebuildRunning: true,
        indexedDocuments: 3,
        lastRebuiltAt: null,
        lastIndexedDocuments: null
      },
      true
    ),
    1_000
  );
  assert.equal(searchIndexFallbackInterval('disconnected', undefined, false), false);
});

test('Search status owns its API path and query key beneath the Search entity', async () => {
  const [api, keys, queries, barrel] = await Promise.all([
    readFile('apps/web/src/entities/search/api/search-api.ts', 'utf8'),
    readFile('apps/web/src/entities/search/api/search-keys.ts', 'utf8'),
    readFile('apps/web/src/entities/search/api/search-queries.ts', 'utf8'),
    readFile('apps/web/src/entities/search/index.ts', 'utf8')
  ]);

  assert.match(api, /\/api\/search\/status/);
  assert.match(keys, /status:\s*\(\)\s*=>\s*\[['"]search['"],\s*['"]status['"]\]/);
  assert.match(queries, /useSearchIndexStatus/);
  assert.match(barrel, /useSearchIndexStatus/);
});

test('Search rebuild mutation owns invalidation but no toast presentation', async () => {
  const source = await readFile(
    'apps/web/src/features/rebuild-search-index/model/use-rebuild-search-index.ts',
    'utf8'
  );

  assert.match(source, /searchInvalidation\.invalidateAll/);
  assert.doesNotMatch(source, /\btoast\b|useI18n|searchIndex\.rebuilt|searchIndex\.failed/);
});

test('Search rebuild conflict detection recognizes only API 409 CONFLICT', async () => {
  const { ApiError } = await import('../../apps/web/src/shared/api/errors.ts');
  const { isSearchIndexRebuildConflict } =
    await import('../../apps/web/src/features/rebuild-search-index/model/search-index-error.ts');

  assert.equal(
    isSearchIndexRebuildConflict(new ApiError('busy', { status: 409, code: 'CONFLICT' })),
    true
  );
  assert.equal(
    isSearchIndexRebuildConflict(new ApiError('bad request', { status: 400, code: 'CONFLICT' })),
    false
  );
  assert.equal(isSearchIndexRebuildConflict(new Error('busy')), false);
});

test('SearchIndexControls owns realtime-aware status, inline feedback, Retry, and conflict sync', async () => {
  const source = await readFile(
    'apps/web/src/features/rebuild-search-index/ui/SearchIndexControls.tsx',
    'utf8'
  );

  assert.match(source, /useConnectionStatus/);
  assert.match(source, /useSearchIndexStatus/);
  assert.match(source, /useRebuildSearchIndex/);
  assert.match(source, /actionFeedbackPolicies\.longRunning\.successDurationMs/);
  assert.match(source, /isSearchIndexRebuildConflict/);
  assert.match(source, /mutation\.reset\(\)/);
  assert.match(source, /query\.refetch\(\)/);
  assert.match(source, /InlineNotice/);
  assert.match(source, /SearchIndexStatusList/);
  assert.doesNotMatch(source, /\btoast\b/);
});

test('Settings renders SearchIndexControls and removes the action-only button', async () => {
  const [settings, barrel] = await Promise.all([
    readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8'),
    readFile('apps/web/src/features/rebuild-search-index/index.ts', 'utf8')
  ]);

  assert.match(settings, /<SearchIndexControls\s*\/>/);
  assert.doesNotMatch(settings, /RebuildSearchIndexButton/);
  assert.match(barrel, /SearchIndexControls/);
  assert.doesNotMatch(barrel, /RebuildSearchIndexButton/);
});

test('Search Index E2E uses explicit state gates instead of request-order races', async () => {
  const source = await readFile('tests/e2e/settings-search-index-sheet.spec.ts', 'utf8');

  assert.match(source, /let failRefresh = false/);
  assert.match(source, /let conflictStarted = false/);
  assert.match(source, /let completed = false/);
  assert.match(source, /runningStatusRequests/);
  assert.match(source, /api\/scheduler\/status/);
  assert.doesNotMatch(source, /statusRequests === 1/);
  assert.doesNotMatch(source, /statusRequests >= 3/);
});
