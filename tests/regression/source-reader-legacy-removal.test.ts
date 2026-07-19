import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const paths = [
  'apps/api/src/modules/plugin',
  'apps/api/src/modules/crawler/domain/source',
  'apps/api/src/modules/crawler/infrastructure/source',
  'apps/api/src/modules/crawler/infrastructure/sources/plugin-source.adapter.ts',
  'apps/api/src/modules/crawler/infrastructure/sources/selector-html.adapter.ts',
  'apps/api/config/source-profiles.json',
  'apps/api/config/source-profiles.example.json',
  'sources',
  'apps/api/src/shared/container/modules/plugin.module.ts'
];

test('legacy source profile and plugin paths are deleted', () => {
  for (const path of paths) assert.equal(existsSync(path), false, path);
  const app = readFileSync('apps/api/src/app.ts', 'utf8');
  const container = readFileSync('apps/api/src/shared/container/app-container.ts', 'utf8');
  const env = readFileSync('apps/api/src/shared/config/env.ts', 'utf8');
  assert.doesNotMatch(app, /\/api\/plugins|createSourcePluginRoutes/);
  assert.doesNotMatch(container, /createPluginModule|plugins\.lifecycle/);
  assert.doesNotMatch(env, /sourceProfilesFile|sourcesDir|genericHtmlAdapterEnabled/);
});
