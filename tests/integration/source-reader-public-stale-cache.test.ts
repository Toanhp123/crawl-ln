import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPluginRegistry } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { InProcessPluginRuntime } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { MemoryReaderCache } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import { HmacCursorCodec } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts';
import { SourceReaderService } from '../../apps/api-legacy/src/modules/source-reader/application/services/source-reader.service.ts';
import { PublicCacheRefreshService } from '../../apps/api-legacy/src/modules/source-reader/application/services/public-cache-refresh.service.ts';
import type { CacheScope } from '../../apps/api-legacy/src/modules/source-reader/public/source-reader.models.ts';
import type { SourceReaderPlugin } from '../../apps/api-legacy/src/modules/source-reader/domain/plugin/source-plugin.ts';

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
    clock: { now: () => '2026-07-20T00:00:00.000Z' },
    signal: new AbortController().signal
  })
};

function createReader(scope: Exclude<CacheScope, 'none'>) {
  let calls = 0;
  let now = new Date('2026-07-20T00:00:00.000Z');
  const plugin: SourceReaderPlugin = {
    manifest: {
      id: `cache-${scope}`,
      name: 'Cache',
      version: '1.0.0',
      engines: { sourceReader: '^2.9.6' },
      capabilities: ['metadata'],
      contracts: { metadata: 1 },
      matchers: [{ hosts: ['example.test'], priority: 1 }],
      runtime: { preferredMode: 'in-process' },
      permissions: { network: { hosts: ['example.test'] } }
    },
    readMetadata: async ({ url }) => {
      calls += 1;
      return {
        data: { title: `Book ${calls}`, sourceUrl: url, sourceName: 'Demo' },
        cacheHints: { scope, ttlMs: 100, staleWhileRevalidateMs: 1_000 }
      };
    }
  };
  const registry = new InMemoryPluginRegistry();
  registry.register(plugin);
  const refresh = new PublicCacheRefreshService();
  const cacheIdentity = {
    public: 'public' as const,
    account: 'credential-a',
    user: 'user-a',
    session: 'session-a',
    network: 'direct'
  };
  const reader = new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    contextFactory,
    new MemoryReaderCache(20),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901'), { now: () => now }),
    { now: () => now },
    {
      resolve: async () => ({
        executionMode: 'in-process' as const,
        browserRequired: false,
        resolvedNetworkRoute: { kind: 'direct' as const, identity: 'direct' },
        cacheIdentity:
          scope === 'public' ? { public: 'public' as const, network: 'direct' } : cacheIdentity,
        ...(scope === 'account' || scope === 'session'
          ? {
              credential: {
                id: 'credential-a',
                ownerType: 'user' as const,
                ownerId: 'user-a',
                strategy: 'bearer-token' as const
              }
            }
          : {}),
        ...(scope === 'session'
          ? {
              session: {
                id: 'session-a',
                pluginId: plugin.manifest.id,
                pluginVersion: '1.0.0',
                credentialProfileId: 'credential-a',
                ownerId: 'user-a',
                networkBinding: 'none' as const
              }
            }
          : {})
      })
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    refresh
  );
  return {
    reader,
    refresh,
    calls: () => calls,
    advance: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    }
  };
}

test('public stale reads return immediately and schedule one refresh', async () => {
  const fixture = createReader('public');
  const request = { url: 'https://example.test/book' };
  const first = await fixture.reader.readMetadata(request);
  assert.equal(first.data.title, 'Book 1');
  fixture.advance(101);
  const [staleOne, staleTwo] = await Promise.all([
    fixture.reader.readMetadata(request),
    fixture.reader.readMetadata(request)
  ]);
  assert.equal(staleOne.data.title, 'Book 1');
  assert.equal(staleTwo.data.title, 'Book 1');
  assert.equal(staleOne.warnings?.at(-1)?.code, 'STALE_CACHE_USED');
  assert.equal(staleTwo.warnings?.at(-1)?.code, 'STALE_CACHE_USED');
  await fixture.refresh.waitForIdle();
  assert.equal(fixture.calls(), 2);
  const refreshed = await fixture.reader.readMetadata(request);
  assert.equal(refreshed.data.title, 'Book 2');
  assert.equal(
    refreshed.warnings?.some((warning) => warning.code === 'STALE_CACHE_USED'),
    false
  );
});

for (const scope of ['account', 'user', 'session'] as const) {
  test(`${scope} cache never returns stale data`, async () => {
    const fixture = createReader(scope);
    const request = {
      url: 'https://example.test/book',
      userId: 'user-a',
      credentialProfileId: 'credential-a'
    };
    assert.equal((await fixture.reader.readMetadata(request)).data.title, 'Book 1');
    fixture.advance(101);
    const fresh = await fixture.reader.readMetadata(request);
    assert.equal(fresh.data.title, 'Book 2');
    assert.equal(
      fresh.warnings?.some((warning) => warning.code === 'STALE_CACHE_USED'),
      false
    );
    assert.equal(fixture.calls(), 2);
  });
}
