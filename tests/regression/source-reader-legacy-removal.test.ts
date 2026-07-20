import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const legacyModule = ['apps/api/src/modules', 'plugin'].join('/');
const legacyConfig = ['apps/api/config', ['source', 'profiles.json'].join('-')].join('/');
const legacyComposition = ['apps/api/src/shared/container/modules', 'plugin.module.ts'].join('/');

const removedPaths = [
  legacyModule,
  legacyConfig,
  'apps/api/src/modules/crawler/infrastructure/adapters',
  'sources',
  legacyComposition
];

test('legacy source execution paths are removed', () => {
  for (const path of removedPaths) assert.equal(existsSync(path), false, `${path} must be removed`);

  const container = readFileSync('apps/api/src/shared/container/app-container.ts', 'utf8');
  const legacyFactory = ['create', 'PluginModule'].join('');
  assert.equal(container.includes(legacyFactory), false);
  assert.doesNotMatch(container, /plugins\.lifecycle/);
});
