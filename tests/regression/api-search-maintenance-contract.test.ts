import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

test('Search module uses maintenance service, status query, ids, and no legacy command handler', async () => {
  const [moduleSource, contractsSource, routesSource, containerSource] = await Promise.all([
    readFile('apps/api/src/modules/search/search.module.ts', 'utf8'),
    readFile('apps/api/src/modules/search/public/search.contracts.ts', 'utf8'),
    readFile('apps/api/src/modules/search/presentation/search.routes.ts', 'utf8'),
    readFile('apps/api/src/bootstrap/app-container.ts', 'utf8')
  ]);

  assert.match(moduleSource, /SearchIndexMaintenanceService/);
  assert.match(moduleSource, /EventBusSearchRebuildLifecyclePublisher/);
  assert.match(moduleSource, /ids:\s*\{\s*randomId\(\): string\s*\}/);
  assert.doesNotMatch(moduleSource, /RebuildSearchIndexCommandHandler/);
  assert.match(contractsSource, /status\(\): Promise<SearchIndexStatus>/);
  assert.match(routesSource, /router\.get\(['"]\/status['"]/);
  assert.match(containerSource, /createSearchModule\(\{[\s\S]*?ids[\s\S]*?\}\)/);

  await assert.rejects(
    access('apps/api/src/modules/search/application/commands/rebuild-search-index.command.ts')
  );
});

test('realtime adapter subscribes to every Search rebuild lifecycle event', async () => {
  const source = await readFile(
    'apps/api/src/platform/realtime/application-event-to-realtime.adapter.ts',
    'utf8'
  );

  for (const event of [
    'SEARCH_REBUILD_STARTED',
    'SEARCH_REBUILD_COMPLETED',
    'SEARCH_REBUILD_FAILED'
  ]) {
    assert.match(source, new RegExp(`subscribe\\(${event}`));
  }
  assert.match(source, /resources:\s*\['search'\]/);
  assert.match(source, /reason:\s*event\.type/);
});
