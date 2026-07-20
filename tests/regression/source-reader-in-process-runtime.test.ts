import assert from 'node:assert/strict';
import test from 'node:test';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

const parser = {
  load: () => ({
    text: () => '',
    attr: () => undefined,
    html: () => '',
    queryAll: () => [],
    nodeText: () => '',
    nodeAttr: () => undefined,
    nodeHtml: () => '',
    remove: () => undefined
  })
};
const clock = { now: () => new Date('2026-07-19T00:00:00.000Z') };
const logger = { info() {}, warn() {}, error() {} };

test('plugin context blocks undeclared network hosts', async () => {
  const factory = new PluginContextFactory(
    { get: async () => ({ url: '', status: 200, headers: {}, data: '' }) } as never,
    parser,
    clock,
    logger
  );
  const context = factory.create({
    pluginId: 'demo',
    allowedHosts: ['example.test'],
    signal: new AbortController().signal,
    runtimeContext: {
      executionMode: 'in-process',
      browserRequired: false,
      cacheIdentity: { public: 'public', network: 'direct' }
    }
  });
  await assert.rejects(
    () => context.http.get('https://forbidden.test/book'),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_NETWORK_PERMISSION_DENIED'
  );
});

test('in-process runtime dispatches only the requested capability', async () => {
  const runtime = new InProcessPluginRuntime();
  const result = await runtime.invoke({
    registration: {
      plugin: {
        manifest: {
          id: 'demo',
          name: 'Demo',
          version: '1.0.0',
          engines: { sourceReader: '>=1.0.0 <2.0.0' },
          capabilities: ['metadata'],
          contracts: { metadata: 1 },
          matchers: [{ hosts: ['example.test'], priority: 1 }],
          runtime: { preferredMode: 'in-process' },
          permissions: { network: { hosts: ['example.test'] } }
        },
        readMetadata: async () => ({
          data: { title: 'Book', sourceUrl: 'https://example.test/book', sourceName: 'Demo' }
        })
      },
      trustLevel: 'built-in',
      executionMode: 'in-process',
      enabled: true
    },
    capability: 'metadata',
    request: { url: 'https://example.test/book' },
    context: {} as never
  });
  assert.equal((result.data as { title: string }).title, 'Book');
});
