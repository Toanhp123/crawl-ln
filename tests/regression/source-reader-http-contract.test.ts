import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('source reader routes expose approved reader and administration surface', async () => {
  const routes = await readFile(
    'apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts',
    'utf8'
  );
  for (const path of [
    '/identify',
    '/metadata',
    '/chapter-list',
    '/chapter-content',
    '/search',
    '/latest-updates',
    '/plugins',
    '/plugins/:pluginId',
    '/credentials',
    '/network-profiles',
    '/auth/challenges'
  ]) {
    assert.match(routes, new RegExp(path.replaceAll('/', '\\/')));
  }
  assert.doesNotMatch(routes, /invokePluginRaw|resolveSecrets|spawnWorker|openBrowserContext/);
});

test('reader controller overwrites user identity from actor context', async () => {
  const controller = await readFile(
    'apps/api/src/modules/source-reader/presentation/controllers/source-reader.controller.ts',
    'utf8'
  );
  assert.match(controller, /sourceReaderActor\?\.id/);
  assert.doesNotMatch(controller, /userId:\s*req\.body/);
});
