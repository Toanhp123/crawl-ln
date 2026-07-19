import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeContextResolverService } from '../../apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';

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

test('explicit user credential wins over defaults', async () => {
  const resolver = new RuntimeContextResolverService(
    credentials as never,
    networks as never,
    sessions as never
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
});

test('required regional route fails explicitly when unavailable', async () => {
  const resolver = new RuntimeContextResolverService(
    credentials as never,
    networks as never,
    sessions as never
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
    sessions as never
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
      findActive: async () => ({
        id: 'session-us',
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        credentialProfileId: 'explicit',
        ownerId: 'u1',
        networkProfileId: 'route-us',
        networkBinding: 'required'
      })
    } as never
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
      error instanceof SourceReaderError && error.code === 'SESSION_NETWORK_MISMATCH'
  );
});
