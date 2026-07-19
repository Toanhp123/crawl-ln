import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('source plugin platform is wired through module boundaries and dedicated Sources UI', async () => {
  const container = await readFile('apps/api/src/shared/container/app-container.ts', 'utf8');
  const crawler = await readFile('apps/api/src/shared/container/modules/crawler.module.ts', 'utf8');
  const app = await readFile('apps/api/src/app.ts', 'utf8');
  const sources = await readFile('apps/web/src/pages/sources/ui/SourcesPage.tsx', 'utf8');
  const settings = await readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8');
  assert.match(container, /createPluginModule/);
  assert.match(crawler, /PluginSourceAdapter/);
  assert.match(app, /\/api\/plugins/);
  assert.match(sources, /SourceProfileCard/);
  assert.doesNotMatch(settings, /SourcePluginsPanel/);
});
