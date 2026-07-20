import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { NetworkRouteResolver } from '../../apps/api/src/modules/source-reader/infrastructure/network/network-route.resolver.ts';
import { ProxyAgentFactory } from '../../apps/api/src/modules/source-reader/infrastructure/network/proxy-agent.factory.ts';
import { RouteAwareHttpClientAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/network/route-aware-http-client.adapter.ts';
import { buildChromiumLaunchOptions } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-launch-options.ts';
import { browserSessionIdentityKey } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { startHttpProxyServer } from '../helpers/http-proxy-server.ts';
import { startSocks5ProxyServer } from '../helpers/socks5-proxy-server.ts';

async function destination() {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ proxied: request.headers['x-test-proxy'] ?? null }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('destination did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/probe`,
    requests: () => requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

test('resolved HTTP and SOCKS profiles route real traffic and never fall back direct', async () => {
  const target = await destination();
  const httpProxy = await startHttpProxyServer();
  const socksProxy = await startSocks5ProxyServer();
  const adapter = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(8));
  try {
    const httpResponse = await adapter.getRouted(target.url, {
      route: { kind: 'http-proxy', identity: 'http-route', endpoint: httpProxy.url }
    });
    assert.deepEqual(JSON.parse(httpResponse.data), { proxied: 'http' });
    assert.equal(httpProxy.requests.length, 1);

    await adapter.getRouted(target.url, {
      route: { kind: 'socks-proxy', identity: 'socks-route', endpoint: socksProxy.url }
    });
    assert.equal(socksProxy.destinations.length, 1);

    const before = target.requests();
    await assert.rejects(
      () =>
        adapter.getRouted(target.url, {
          route: {
            kind: 'http-proxy',
            identity: 'offline-route',
            endpoint: 'http://127.0.0.1:1',
            username: 'user',
            password: 'super-secret'
          },
          timeoutMs: 200
        }),
      (error: unknown) =>
        error instanceof SourceReaderError &&
        error.code === 'NETWORK_ROUTE_UNAVAILABLE' &&
        !String(error).includes('super-secret')
    );
    assert.equal(target.requests(), before);
  } finally {
    adapter.destroy();
    await httpProxy.close();
    await socksProxy.close();
    await target.close();
  }
});

test('route resolver validates schemes and hashes credential-bearing configuration', async () => {
  const resolver = new NetworkRouteResolver({
    resolveConfig: async () => ({
      endpoint: 'http://proxy.example:8080',
      username: 'alice',
      password: 'secret'
    })
  } as never);
  const route = await resolver.resolve({
    id: 'route-1',
    ownerType: 'system',
    routeType: 'http-proxy',
    regions: [],
    tags: [],
    healthStatus: 'healthy'
  });
  assert.equal(route.kind, 'http-proxy');
  assert.notEqual(route.identity, 'route-1');
  assert.equal('password' in route ? route.password : undefined, 'secret');

  await assert.rejects(
    () =>
      new NetworkRouteResolver({
        resolveConfig: async () => ({ endpoint: 'ftp://proxy.test' })
      } as never).resolve({
        id: 'route-2',
        ownerType: 'system',
        routeType: 'http-proxy',
        regions: [],
        tags: [],
        healthStatus: 'healthy'
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'NETWORK_ROUTE_UNSUPPORTED'
  );
});

test('Chromium launch options and pooling identity include the selected route identity', () => {
  assert.deepEqual(
    buildChromiumLaunchOptions({
      browserExecutablePath: '/usr/bin/chromium',
      route: {
        kind: 'socks-proxy',
        identity: 'route-a',
        endpoint: 'socks5://proxy.test:1080',
        username: 'alice',
        password: 'secret'
      }
    }).proxy,
    { server: 'socks5://proxy.test:1080', username: 'alice', password: 'secret' }
  );
  const base = {
    userId: 'u1',
    pluginId: 'p1',
    pluginVersion: '1.0.0',
    sourceAccountId: 'a1',
    credentialId: 'a1',
    sessionId: 's1'
  };
  assert.notEqual(
    browserSessionIdentityKey({ ...base, networkIdentity: 'route-a' }),
    browserSessionIdentityKey({ ...base, networkIdentity: 'route-b' })
  );
});
