import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceReaderService } from '../../apps/api/src/modules/source-reader/application/services/source-reader.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import type { SourceReaderPlugin } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';
import { MemoryReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/cursor/hmac-cursor.codec.ts';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';

const now = new Date('2026-07-20T00:00:00.000Z');

function manifest(options?: { requiresBrowser?: boolean; browserPermission?: boolean }) {
  return {
    id: 'premium-demo',
    name: 'Premium Demo',
    version: '1.0.0',
    engines: { sourceReader: '>=1.0.0 <2.0.0' },
    capabilities: ['chapter-content'] as const,
    contracts: { 'chapter-content': 1 },
    matchers: [{ hosts: ['example.test'], priority: 10 }],
    runtime: {
      preferredMode: 'in-process' as const,
      ...(options?.requiresBrowser ? { requiresBrowser: true } : {})
    },
    permissions: {
      network: { hosts: ['example.test'] },
      authentication: true,
      ...(options?.browserPermission ? { browser: true } : {})
    },
    runtimeRequirements: {
      authentication: { required: true, methods: ['form-login' as const] }
    }
  };
}

function createReader(input: {
  plugin: SourceReaderPlugin;
  runtimeContext: Record<string, unknown>;
  contextFactory?: PluginContextFactory;
  browser?: {
    open: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    closeByIdentity: () => Promise<void>;
  };
}) {
  const registry = new InMemoryPluginRegistry();
  registry.register(input.plugin);
  const fallbackFactory = new PluginContextFactory(
    {
      get: async (url) => ({ url, status: 200, headers: {}, data: '' }),
      post: async () => ({ url: '', status: 200, headers: {}, data: '' }),
      head: async () => ({ url: '', status: 200, headers: {}, data: '' })
    },
    { load: () => ({}) } as never,
    { now: () => now },
    { info() {}, warn() {}, error() {} }
  );
  return new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    input.contextFactory ?? (fallbackFactory as never),
    new MemoryReaderCache(20),
    new HmacCursorCodec(Buffer.from('01234567890123456789012345678901'), { now: () => now }),
    { now: () => now },
    { resolve: async () => input.runtimeContext } as never,
    undefined,
    input.browser as never
  );
}

test('read requiring auth returns AUTHENTICATION_REQUIRED when no session exists', async () => {
  let invoked = 0;
  const plugin: SourceReaderPlugin = {
    manifest: manifest(),
    async readChapterContent({ url }) {
      invoked += 1;
      return { data: { title: 'Premium', url, rawText: 'raw', cleanText: 'clean' } };
    }
  };
  const reader = createReader({
    plugin,
    runtimeContext: {
      credential: {
        id: 'cred-1',
        ownerType: 'user',
        ownerId: 'u1',
        strategy: 'form-login'
      },
      executionMode: 'in-process',
      browserRequired: false,
      cacheIdentity: {
        public: 'public',
        account: 'cred-1',
        user: 'u1',
        network: 'direct'
      }
    }
  });

  await assert.rejects(
    () => reader.readChapterContent({ url: 'https://example.test/premium/1', userId: 'u1' }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'AUTHENTICATION_REQUIRED'
  );
  assert.equal(invoked, 0);
});

test('active route-bound session attaches cookies to host HTTP requests', async () => {
  let requestHeaders: Record<string, string> | undefined;
  const session = {
    id: 'session-1',
    pluginId: 'premium-demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'cred-1',
    ownerId: 'u1',
    networkProfileId: 'route-us',
    networkBinding: 'required' as const
  };
  const factory = new PluginContextFactory(
    {
      get: async (url, options) => {
        requestHeaders = options?.headers;
        return { url, status: 200, headers: {}, data: '<article>premium</article>' };
      },
      post: async () => ({ url: '', status: 200, headers: {}, data: '' }),
      head: async () => ({ url: '', status: 200, headers: {}, data: '' })
    },
    { load: () => ({}) } as never,
    { now: () => now },
    { info() {}, warn() {}, error() {} },
    {
      resolveMaterial: async () => ({
        kind: 'cookies',
        cookies: [{ name: 'sid', value: 'abc' }],
        networkBinding: 'required'
      })
    }
  );
  const plugin: SourceReaderPlugin = {
    manifest: manifest(),
    async readChapterContent({ url }, context) {
      await context.http.get(url);
      return { data: { title: 'Premium', url, rawText: 'raw', cleanText: 'clean' } };
    }
  };
  const reader = createReader({
    plugin,
    contextFactory: factory,
    runtimeContext: {
      credential: {
        id: 'cred-1',
        ownerType: 'user',
        ownerId: 'u1',
        strategy: 'form-login'
      },
      session,
      networkRoute: {
        id: 'route-us',
        ownerType: 'user',
        ownerId: 'u1',
        routeType: 'direct',
        regions: ['US'],
        tags: [],
        healthStatus: 'healthy'
      },
      executionMode: 'in-process',
      browserRequired: false,
      cacheIdentity: {
        public: 'public',
        account: 'cred-1',
        user: 'u1',
        session: 'session-1',
        network: 'direct'
      }
    }
  });

  await reader.readChapterContent({
    url: 'https://example.test/premium/1',
    userId: 'u1',
    networkProfileId: 'route-us'
  });
  assert.match(requestHeaders?.Cookie ?? '', /sid=abc/);
});

test('browser-required read opens the approved browser identity and exposes only browser operations', async () => {
  const opened: Array<Record<string, unknown>> = [];
  const browserHandle = {
    id: 'browser-1',
    open: async () => undefined,
    waitFor: async () => undefined,
    text: async () => 'browser premium',
    html: async () => '<p>browser premium</p>',
    click: async () => undefined,
    fillSecret: async () => undefined,
    cookies: async () => [],
    close: async () => undefined
  };
  const plugin: SourceReaderPlugin = {
    manifest: manifest({ requiresBrowser: true, browserPermission: true }),
    async readChapterContent({ url }, context) {
      assert.ok(context.browser);
      const text = await context.browser.text('article');
      return { data: { title: 'Premium', url, rawText: text ?? '', cleanText: text ?? '' } };
    }
  };
  const reader = createReader({
    plugin,
    browser: {
      open: async (input) => {
        opened.push(input);
        return browserHandle;
      },
      closeByIdentity: async () => undefined
    },
    runtimeContext: {
      credential: {
        id: 'cred-1',
        ownerType: 'user',
        ownerId: 'u1',
        strategy: 'form-login'
      },
      session: {
        id: 'session-1',
        pluginId: 'premium-demo',
        pluginVersion: '1.0.0',
        credentialProfileId: 'cred-1',
        ownerId: 'u1',
        networkBinding: 'preferred'
      },
      executionMode: 'in-process',
      browserRequired: true,
      cacheIdentity: {
        public: 'public',
        account: 'cred-1',
        user: 'u1',
        session: 'session-1',
        network: 'direct'
      }
    }
  });

  const result = await reader.readChapterContent({
    url: 'https://example.test/premium/1',
    userId: 'u1'
  });
  assert.equal(result.data.cleanText, 'browser premium');
  assert.deepEqual(opened[0]?.identity, {
    userId: 'u1',
    pluginId: 'premium-demo',
    pluginVersion: '1.0.0',
    sourceAccountId: 'cred-1',
    credentialId: 'cred-1',
    sessionId: 'session-1',
    networkIdentity: 'direct'
  });
});
