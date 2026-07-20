import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import type {
  PluginContext,
  SourcePluginManifest
} from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { IsolatedWorkerPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker/isolated-worker-plugin.runtime.ts';

const pluginPath = resolve(
  'tests/fixtures/source-reader/external-plugins/worker-demo/dist/index.js'
);
const manifest: SourcePluginManifest = {
  id: 'worker-demo',
  name: 'Worker Demo',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'],
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['example.test'], priority: 10 }],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['example.test'] } }
};

function contextFixture(logs: string[] = []): PluginContext {
  return {
    http: {
      async get(url) {
        return { url, status: 200, headers: {}, data: '<html></html>' };
      }
    },
    html: {
      load() {
        return {
          text: () => '',
          attr: () => undefined,
          html: () => '',
          all: () => [],
          remove: () => undefined
        };
      }
    },
    url: {
      normalize: (value) => new URL(value).toString(),
      resolve: (value, base) => new URL(value, base).toString()
    },
    cache: { get: async () => undefined, set: async () => undefined },
    logger: {
      info: (message) => logs.push(message),
      warn: (message) => logs.push(message)
    },
    clock: { now: () => '2026-07-20T00:00:00.000Z' },
    signal: new AbortController().signal
  };
}

test('isolated worker invokes plugin without exposing process.env', async () => {
  process.env.WORKER_SECRET_SENTINEL = 'must-not-leak';
  const logs: string[] = [];
  const runtime = new IsolatedWorkerPluginRuntime({ defaultTimeoutMs: 10_000 });
  const result = await runtime.invokeExternal({
    pluginPath,
    manifest,
    capability: 'metadata',
    request: { url: 'https://example.test/book' },
    context: contextFixture(logs)
  });
  delete process.env.WORKER_SECRET_SENTINEL;

  assert.equal((result.data as { title: string }).title, 'Worker Demo');
  assert.equal((result.data as { sourceUrl: string }).sourceUrl, 'https://example.test/resolved');
  assert.equal((result.extensions?.['demo/env']?.data as { leaked: boolean }).leaked, false);
  assert.deepEqual(logs, ['worker-demo']);
});

test('hung worker is terminated and mapped to plugin runtime error', async () => {
  const runtime = new IsolatedWorkerPluginRuntime({ defaultTimeoutMs: 20 });
  await assert.rejects(
    () =>
      runtime.invokeExternal({
        pluginPath,
        manifest,
        capability: 'metadata',
        request: { url: 'https://example.test/book', mode: 'hang' },
        context: contextFixture()
      }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_UNAVAILABLE'
  );
});

test('worker plugin failures are mapped without crashing the host', async () => {
  const runtime = new IsolatedWorkerPluginRuntime({ defaultTimeoutMs: 10_000 });
  await assert.rejects(
    () =>
      runtime.invokeExternal({
        pluginPath,
        manifest,
        capability: 'metadata',
        request: { url: 'https://example.test/book', mode: 'crash' },
        context: contextFixture()
      }),
    (error: unknown) =>
      error instanceof SourceReaderError &&
      error.code === 'PLUGIN_UNAVAILABLE' &&
      /worker-demo-crash/.test(error.message)
  );
});
