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
