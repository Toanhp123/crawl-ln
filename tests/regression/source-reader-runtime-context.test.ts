import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeContextResolverService } from '../../apps/api-legacy/src/modules/source-reader/application/services/runtime-context-resolver.service.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';

const credentials = {
  findHandleById: async (id: string) =>
    id === 'explicit'
      ? { id, ownerType: 'user', ownerId: 'u1', strategy: 'form-login' }
      : undefined,
  findCandidates: async () => [
    { id: 'user-default', ownerType: 'user', ownerId: 'u1', strategy: 'form-login' },
    { id: 'system-default', ownerType: 'system', strategy: 'form-login' }
  ]
};
const sessions = { findActive: async () => undefined };
const networks = {
  findHandleById: async () => undefined,
  findCandidates: async () => []
};
const routes = {
  resolve: async () => ({ kind: 'direct' as const, identity: 'direct' as const })
};

test('explicit user credential wins over defaults', async () => {
  const resolver = new RuntimeContextResolverService(
    credentials as never,
    networks as never,
    sessions as never,
    routes as never
  );
  const result = await resolver.resolve({
    userId: 'u1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    domain: 'example.test',
    capability: 'metadata',
    credentialProfileId: 'explicit',
    runtimeRequirements: {}
  });
  assert.equal(result.credential?.id, 'explicit');
  assert.deepEqual(result.cacheIdentity, {
    public: 'public',
    account: 'explicit',
    user: 'u1',
    network: 'direct'
  });
});

test('required regional route fails explicitly when unavailable', async () => {
  const resolver = new RuntimeContextResolverService(
    credentials as never,
    networks as never,
    sessions as never,
    routes as never
  );
  await assert.rejects(
    () =>
      resolver.resolve({
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        domain: 'example.test',
        capability: 'metadata',
        runtimeRequirements: {
          network: {
            required: true,
            regions: ['US'],
            allowDirectFallback: false
          }
        }
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'NETWORK_REGION_UNAVAILABLE'
  );
});

test('user-owned explicit profiles cannot be used by another actor', async () => {
  const resolver = new RuntimeContextResolverService(
    credentials as never,
    networks as never,
    sessions as never,
    routes as never
  );
  await assert.rejects(
    () =>
      resolver.resolve({
        userId: 'u2',
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        domain: 'example.test',
        capability: 'metadata',
        credentialProfileId: 'explicit',
        runtimeRequirements: {}
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_PERMISSION_DENIED'
  );
});

test('required session route mismatch fails before plugin invocation', async () => {
  const resolver = new RuntimeContextResolverService(
    credentials as never,
    {
      findHandleById: async () => ({
        id: 'route-eu',
        ownerType: 'user',
        ownerId: 'u1',
        routeType: 'direct',
        regions: ['EU'],
        tags: [],
        healthStatus: 'healthy'
      }),
      findCandidates: async () => []
    } as never,
    {
      findActive: async (input: Record<string, unknown>) => {
        assert.deepEqual(input, {
          pluginId: 'demo',
          pluginVersion: '1.0.0',
          credentialProfileId: 'explicit',
          ownerId: 'u1',
          networkProfileId: 'route-eu'
        });
        throw new SourceReaderError('SESSION_BINDING_MISMATCH', 'Session is bound to route-us', {
          retryable: false,
          fallbackAllowed: false
        });
      }
    } as never,
    routes as never
  );

  await assert.rejects(
    () =>
      resolver.resolve({
        userId: 'u1',
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        domain: 'example.test',
        capability: 'metadata',
        credentialProfileId: 'explicit',
        networkProfileId: 'route-eu',
        runtimeRequirements: {}
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SESSION_BINDING_MISMATCH'
  );
});

test('browser requirement is independent from authentication requirements', async () => {
  const resolver = new RuntimeContextResolverService(
    { findHandleById: async () => undefined, findCandidates: async () => [] } as never,
    networks as never,
    sessions as never,
    routes as never
  );
  const result = await resolver.resolve({
    pluginId: 'public-browser',
    pluginVersion: '1.0.0',
    domain: 'example.test',
    capability: 'metadata',
    runtimeRequirements: {},
    requiresBrowser: true
  });
  assert.equal(result.credential, undefined);
  assert.equal(result.browserRequired, true);
});
