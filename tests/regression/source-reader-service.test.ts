import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { MemoryReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts';
import { SourceReaderService } from '../../apps/api/src/modules/source-reader/application/services/source-reader.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import type { SourceReaderPlugin } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

const manifest = (id: string, priority: number) => ({
  id,
  name: id,
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata', 'chapter-list'] as const,
  contracts: { metadata: 1, 'chapter-list': 1 },
  matchers: [{ hosts: ['example.test'], priority }],
  runtime: { preferredMode: 'in-process' as const },
  permissions: { network: { hosts: ['example.test'] } }
});

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
    clock: { now: () => '2026-07-19T00:00:00.000Z' },
    signal: new AbortController().signal
  })
};

function createService(
  plugins: SourceReaderPlugin[],
  clock = { now: () => new Date('2026-07-19T00:00:00.000Z') }
) {
  const registry = new InMemoryPluginRegistry();
  plugins.forEach((plugin) => registry.register(plugin));
  return new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    contextFactory,
    new MemoryReaderCache(100),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901')),
    clock
  );
}

test('service falls back when a higher-priority plugin reports a fallback-safe error', async () => {
  const high: SourceReaderPlugin = {
    manifest: manifest('high', 100),
    readMetadata: async () => {
      throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'bad parse', {
        retryable: false,
        fallbackAllowed: true
      });
    },
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  const low: SourceReaderPlugin = {
    manifest: manifest('low', 10),
    readMetadata: async ({ url }) => ({
      data: { title: 'Fallback', sourceUrl: url, sourceName: 'Low' }
    }),
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  const result = await createService([high, low]).readMetadata({
    url: 'https://example.test/book'
  });
  assert.equal(result.data.title, 'Fallback');
  assert.equal(result.source.pluginId, 'low');
});

test('service reports unsupported capabilities without invoking another capability', async () => {
  const plugin: SourceReaderPlugin = {
    manifest: manifest('metadata-only', 1),
    readMetadata: async ({ url }) => ({
      data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' }
    }),
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  await assert.rejects(
    () => createService([plugin]).readChapterContent({ url: 'https://example.test/chapter/1' }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'CAPABILITY_NOT_SUPPORTED'
  );
});

test('chapter-list streaming yields bounded batches', async () => {
  const plugin: SourceReaderPlugin = {
    manifest: manifest('list', 1),
    readMetadata: async ({ url }) => ({
      data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' }
    }),
    readChapterList: async ({ url }) => ({
      data: {
        items: [1, 2, 3].map((index) => ({
          index,
          title: `Chapter ${index}`,
          url: `${url}/${index}`
        })),
        hasMore: false
      }
    })
  };
  const batches = [];
  for await (const batch of createService([plugin]).streamChapterList({
    url: 'https://example.test/book',
    batchSize: 2
  })) {
    batches.push(batch.data.map((item) => item.index));
  }
  assert.deepEqual(batches, [[1, 2], [3]]);
});

test('service cache expiry follows the injected clock', async () => {
  let calls = 0;
  let now = new Date('2026-07-19T00:00:00.000Z');
  const plugin: SourceReaderPlugin = {
    manifest: manifest('cached', 1),
    readMetadata: async ({ url }) => {
      calls += 1;
      return {
        data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' },
        cacheHints: { scope: 'public', ttlMs: 1_000 }
      };
    },
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  const service = createService([plugin], { now: () => now });

  await service.readMetadata({ url: 'https://example.test/book' });
  await service.readMetadata({ url: 'https://example.test/book' });
  assert.equal(calls, 1);

  now = new Date(now.getTime() + 1_001);
  await service.readMetadata({ url: 'https://example.test/book' });
  assert.equal(calls, 2);
});

test('service signs module-managed cursors and resumes list offsets', async () => {
  const receivedCursors: Array<string | undefined> = [];
  const plugin: SourceReaderPlugin = {
    manifest: manifest('paged', 1),
    readMetadata: async ({ url }) => ({
      data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' }
    }),
    readChapterList: async ({ url, cursor }) => {
      receivedCursors.push(cursor);
      return {
        data: {
          items: [1, 2, 3].map((index) => ({
            index,
            title: `Chapter ${index}`,
            url: `${url}/${index}`
          })),
          hasMore: false
        }
      };
    }
  };
  const service = createService([plugin]);

  const first = await service.readChapterList({
    url: 'https://example.test/book',
    limit: 2
  });
  assert.deepEqual(
    first.data.items.map((item) => item.index),
    [1, 2]
  );
  assert.equal(first.data.hasMore, true);
  assert.ok(first.data.nextCursor);

  const second = await service.readChapterList({
    url: 'https://example.test/book',
    limit: 2,
    cursor: first.data.nextCursor
  });
  assert.deepEqual(
    second.data.items.map((item) => item.index),
    [3]
  );
  assert.equal(second.data.hasMore, false);
  assert.equal(second.data.nextCursor, undefined);
  assert.deepEqual(receivedCursors, [undefined, undefined]);
});

test('service resolves runtime context before invoking a plugin', async () => {
  const plugin: SourceReaderPlugin = {
    manifest: manifest('runtime-aware', 1),
    readMetadata: async ({ url }) => ({
      data: { title: 'Book', sourceUrl: url, sourceName: 'Demo' }
    }),
    readChapterList: async () => ({ data: { items: [], hasMore: false } })
  };
  const registry = new InMemoryPluginRegistry();
  registry.register(plugin);
  const resolvedInputs: Array<Record<string, unknown>> = [];
  const contextInputs: Array<Record<string, unknown>> = [];
  const runtimeContext = {
    credential: {
      id: 'cred-1',
      ownerType: 'user' as const,
      ownerId: 'u1',
      strategy: 'form-login' as const
    },
    executionMode: 'in-process' as const,
    browserRequired: false,
    cacheIdentity: { authScope: 'auth', networkScope: 'direct' }
  };
  const service = new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    {
      create: (input: Record<string, unknown>) => {
        contextInputs.push(input);
        return contextFactory.create();
      }
    } as never,
    new MemoryReaderCache(100),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901')),
    { now: () => new Date('2026-07-19T00:00:00.000Z') },
    {
      resolve: async (input: Record<string, unknown>) => {
        resolvedInputs.push(input);
        return runtimeContext;
      }
    } as never
  );

  await service.readMetadata({
    url: 'https://example.test/book',
    userId: 'u1',
    credentialProfileId: 'cred-1'
  });

  assert.equal(resolvedInputs.length, 1);
  assert.equal(resolvedInputs[0].userId, 'u1');
  assert.deepEqual(contextInputs[0].runtimeContext, runtimeContext);
});
