import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { MemoryReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts';
import { SourceReaderService } from '../../apps/api/src/modules/source-reader/application/services/source-reader.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { createActivatedExtensionContract } from '../../apps/api/src/modules/source-reader/application/services/plugin-extension-validator.ts';
import type { SourceReaderPlugin } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

const clock = { now: () => new Date('2026-07-20T00:00:00.000Z') };
const contextFactory = {
  create: () => ({
    http: { get: async () => ({ url: '', status: 200, headers: {}, data: '' }) },
    html: {
      load: () => ({
        text: () => '',
        attr: () => undefined,
        html: () => '',
        all: () => [],
        remove() {}
      })
    },
    url: {
      normalize: (value: string) => value,
      resolve: (value: string, base: string) => new URL(value, base).toString()
    },
    cache: { get: async () => undefined, set: async () => undefined },
    logger: { info() {}, warn() {} },
    clock: { now: () => clock.now().toISOString() },
    signal: new AbortController().signal
  })
};

function plugin(overrides: Partial<SourceReaderPlugin> = {}): SourceReaderPlugin {
  return {
    manifest: {
      id: 'extensions',
      name: 'Extensions',
      version: '1.0.0',
      engines: { sourceReader: '^2.9.6' },
      capabilities: ['search', 'latest-updates'],
      contracts: { search: 1, 'latest-updates': 1 },
      matchers: [{ hosts: ['example.test'], priority: 10 }],
      runtime: { preferredMode: 'in-process' },
      permissions: { network: { hosts: ['example.test'] } },
      extensionContracts: {
        'demo/required': { version: 1, schema: 'required.json', required: true },
        'demo/optional': { version: 2, schema: 'optional.json', required: false }
      }
    },
    search: async () => ({ data: { items: [], hasMore: false } }),
    latestUpdates: async () => ({ data: { items: [], hasMore: false } }),
    ...overrides
  };
}

function service(input: SourceReaderPlugin) {
  const registry = new InMemoryPluginRegistry();
  registry.register(input, {
    activatedExtensionContracts: {
      'demo/required': createActivatedExtensionContract({
        namespace: 'demo/required',
        version: '1',
        required: true,
        schema: {
          type: 'object',
          properties: { token: { type: 'string' } },
          required: ['token'],
          additionalProperties: false
        }
      }),
      'demo/optional': createActivatedExtensionContract({
        namespace: 'demo/optional',
        version: '2',
        required: false,
        schema: {
          type: 'object',
          properties: { score: { type: 'number' } },
          required: ['score'],
          additionalProperties: false
        }
      })
    }
  });
  return new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    contextFactory,
    new MemoryReaderCache(100),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901'), clock),
    clock
  );
}

test('search and latest-updates reject malformed concrete items', async () => {
  const malformed = service(
    plugin({
      search: async () => ({ data: { items: [{ title: '', url: 'not-a-url' }], hasMore: false } }),
      latestUpdates: async () => ({
        data: {
          items: [
            { novelTitle: 'Novel', novelUrl: 'https://example.test/n', updatedAt: 42 as never }
          ],
          hasMore: false
        }
      })
    })
  );
  await assert.rejects(
    () => malformed.search({ url: 'https://example.test/search', query: 'x' }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_RESULT_INVALID'
  );
  await assert.rejects(
    () => malformed.latestUpdates({ url: 'https://example.test/latest' }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_RESULT_INVALID'
  );
});

test('required extension failure rejects the whole invocation', async () => {
  const reader = service(
    plugin({
      search: async () => ({
        data: { items: [], hasMore: false },
        extensions: {
          'demo/required': { version: 1, data: { token: 42 } },
          'demo/optional': { version: 2, data: { score: 1 } }
        }
      })
    })
  );
  await assert.rejects(
    () => reader.search({ url: 'https://example.test/search', query: 'x' }),
    (error: unknown) =>
      error instanceof SourceReaderError &&
      error.code === 'PLUGIN_RESULT_INVALID' &&
      !JSON.stringify(error.details).includes('42')
  );
});

test('optional extension failure omits only that namespace and returns a warning', async () => {
  const reader = service(
    plugin({
      search: async () => ({
        data: { items: [], hasMore: false },
        extensions: {
          'demo/required': { version: 1, data: { token: 'ok' } },
          'demo/optional': { version: 2, data: { score: 'bad' } }
        }
      })
    })
  );
  const result = await reader.search({ url: 'https://example.test/search', query: 'x' });
  assert.deepEqual(result.extensions, {
    'demo/required': { version: 1, data: { token: 'ok' } }
  });
  assert.deepEqual(result.warnings, [
    {
      code: 'PLUGIN_EXTENSION_OMITTED',
      message: 'Optional extension demo/optional@2 was omitted'
    }
  ]);
});

test('cursor is invalidated when activated extension contract versions change', async () => {
  const sourcePlugin = plugin({
    search: async () => ({
      data: {
        items: [
          { title: 'One', url: 'https://example.test/one' },
          { title: 'Two', url: 'https://example.test/two' }
        ],
        hasMore: false
      },
      extensions: {
        'demo/required': { version: 1, data: { token: 'ok' } }
      }
    })
  });
  const registry = new InMemoryPluginRegistry();
  registry.register(sourcePlugin, {
    activatedExtensionContracts: {
      'demo/required': createActivatedExtensionContract({
        namespace: 'demo/required',
        version: '1',
        required: true,
        schema: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] }
      })
    }
  });
  const reader = new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    contextFactory,
    new MemoryReaderCache(100),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901'), clock),
    clock
  );
  const first = await reader.search({ url: 'https://example.test/search', query: 'x', limit: 1 });
  assert.ok(first.data.nextCursor);
  registry.unregister('extensions');
  registry.register(sourcePlugin, {
    activatedExtensionContracts: {
      'demo/required': createActivatedExtensionContract({
        namespace: 'demo/required',
        version: '2',
        required: true,
        schema: { type: 'object' }
      })
    }
  });
  await assert.rejects(
    () =>
      reader.search({
        url: 'https://example.test/search',
        query: 'x',
        limit: 1,
        cursor: first.data.nextCursor
      }),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'CURSOR_INVALIDATED'
  );
});
