import assert from 'node:assert/strict';
import test from 'node:test';
import { InProcessPluginRuntime } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { RuntimeRouter } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/runtime-router.ts';
import { PluginContextFactory } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';

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

test('runtime router enforces request-specific timeout for an uncooperative in-process plugin', async () => {
  let pluginSignal: AbortSignal | undefined;
  const router = new RuntimeRouter(
    new InProcessPluginRuntime(),
    {
      start: async () => {
        throw new Error('external runtime should not start');
      }
    } as never,
    5_000
  );

  await assert.rejects(
    () =>
      router.invoke({
        registration: {
          plugin: {
            manifest: {
              id: 'hanging-demo',
              name: 'Hanging Demo',
              version: '1.0.0',
              engines: { sourceReader: '>=1.0.0 <2.0.0' },
              capabilities: ['metadata'],
              contracts: { metadata: 1 },
              matchers: [{ hosts: ['example.test'], priority: 1 }],
              runtime: { preferredMode: 'in-process' },
              permissions: { network: { hosts: ['example.test'] } }
            },
            readMetadata: async (_request, context) => {
              pluginSignal = context.signal;
              return new Promise(() => undefined);
            }
          },
          trustLevel: 'built-in',
          executionMode: 'in-process',
          enabled: true
        },
        capability: 'metadata',
        request: { url: 'https://example.test/book' },
        context: { signal: new AbortController().signal } as never,
        timeoutMs: 25
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SOURCE_REQUEST_TIMEOUT'
  );
  assert.equal(pluginSignal?.aborted, true);
});

test('runtime router uses the requested timeout when building an isolated deadline', async () => {
  let deadlineAt = '';
  const before = Date.now();
  const router = new RuntimeRouter(
    new InProcessPluginRuntime(),
    {
      start: async () => ({
        request: async (request: { deadlineAt: string }) => {
          deadlineAt = request.deadlineAt;
          return {
            data: { title: 'Book', sourceUrl: 'https://example.test/book', sourceName: 'Demo' }
          };
        },
        terminate: async () => undefined
      })
    } as never,
    5_000
  );
  await router.invoke({
    registration: {
      plugin: {
        manifest: {
          id: 'isolated-demo',
          name: 'Isolated Demo',
          version: '1.0.0',
          engines: { sourceReader: '>=1.0.0 <2.0.0' },
          capabilities: ['metadata'],
          contracts: { metadata: 1 },
          matchers: [{ hosts: ['example.test'], priority: 1 }],
          runtime: { preferredMode: 'isolated' },
          permissions: { network: { hosts: ['example.test'] } }
        }
      },
      trustLevel: 'signed',
      executionMode: 'isolated',
      enabled: true,
      packagePath: '/tmp/isolated-demo'
    },
    capability: 'metadata',
    request: { url: 'https://example.test/book' },
    context: { signal: new AbortController().signal, clock: { now: () => '' } } as never,
    timeoutMs: 40
  });
  const deadlineMs = Date.parse(deadlineAt);
  assert.ok(deadlineMs >= before + 20);
  assert.ok(deadlineMs <= Date.now() + 100);
});
