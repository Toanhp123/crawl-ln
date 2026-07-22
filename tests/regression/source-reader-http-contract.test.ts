import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sourceUrlRequestSchema } from '../../apps/api-legacy/src/modules/source-reader/presentation/dto/source-reader.dto.ts';

test('source reader routes expose approved reader and administration surface', async () => {
  const routes = await readFile(
    'apps/api-legacy/src/modules/source-reader/presentation/routes/source-reader.routes.ts',
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
    'apps/api-legacy/src/modules/source-reader/presentation/controllers/source-reader.controller.ts',
    'utf8'
  );
  assert.match(controller, /sourceReaderActor\?\.id/);
  assert.doesNotMatch(controller, /userId:\s*req\.body/);
});

test('reader request DTO accepts only bounded execution timeouts', () => {
  assert.equal(
    sourceUrlRequestSchema.safeParse({ url: 'https://example.test/book', timeoutMs: 25 }).success,
    true
  );
  assert.equal(
    sourceUrlRequestSchema.safeParse({ url: 'https://example.test/book', timeoutMs: 0 }).success,
    false
  );
  assert.equal(
    sourceUrlRequestSchema.safeParse({ url: 'https://example.test/book', timeoutMs: 120_001 })
      .success,
    false
  );
});
