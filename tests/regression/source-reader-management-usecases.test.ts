import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EnablePluginUseCase,
  InstallSourcePluginUseCase,
  ListPluginsUseCase
} from '../../apps/api/src/modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.ts';
import {
  CreateCredentialUseCase,
  LoginCredentialUseCase,
  UpdateCredentialSecretUseCase
} from '../../apps/api/src/modules/source-reader/application/use-cases/credentials/manage-credentials.usecase.ts';
import {
  CreateNetworkProfileUseCase,
  UpdateNetworkProfileUseCase
} from '../../apps/api/src/modules/source-reader/application/use-cases/network/manage-network-profiles.usecase.ts';
import { RespondAuthChallengeUseCase } from '../../apps/api/src/modules/source-reader/application/use-cases/auth-challenges/manage-auth-challenges.usecase.ts';

const actor = { id: 'user-1', roles: ['source-admin'] as const };
const clock = { now: () => new Date('2026-07-20T00:00:00.000Z') };
const ids = { randomId: () => 'generated-1' };

test('plugin installation requires source-admin and redacts package paths', async () => {
  const required: string[] = [];
  const result = await new InstallSourcePluginUseCase(
    { requireRole: (_actor: unknown, role: string) => required.push(role) } as never,
    {
      install: async () => ({
        installationId: 'i1',
        pluginId: 'demo',
        version: '1.0.0',
        status: 'pending-approval',
        packagePath: '/secret/path'
      })
    } as never
  ).execute({ actor, bytes: Buffer.from('package'), originalName: 'demo.source-plugin' });

  assert.deepEqual(required, ['source-admin']);
  assert.deepEqual(result, {
    installationId: 'i1',
    pluginId: 'demo',
    version: '1.0.0',
    status: 'pending-approval'
  });
  assert.equal('packagePath' in result, false);
});

test('plugin listing requires reader and exposes installed metadata', async () => {
  const required: string[] = [];
  const result = await new ListPluginsUseCase(
    { requireRole: (_actor: unknown, role: string) => required.push(role) } as never,
    { listInstalled: async () => [{ pluginId: 'demo', version: '1.0.0' }] } as never
  ).execute({ actor });
  assert.deepEqual(required, ['reader']);
  assert.deepEqual(result, [{ pluginId: 'demo', version: '1.0.0' }]);
});

test('credential creation persists secret but returns metadata only', async () => {
  let saved: Record<string, unknown> | undefined;
  const result = await new CreateCredentialUseCase(
    { assertCredentialAccess: () => undefined } as never,
    { save: async (input: Record<string, unknown>) => void (saved = input) } as never,
    ids,
    clock
  ).execute({
    actor,
    ownerType: 'user',
    pluginId: 'demo',
    name: 'Primary',
    strategy: 'bearer-token',
    secret: { token: 'top-secret' }
  });

  assert.equal((saved?.secret as { token: string }).token, 'top-secret');
  assert.deepEqual(result, {
    id: 'generated-1',
    name: 'Primary',
    ownerType: 'user',
    ownerId: 'user-1',
    strategy: 'bearer-token'
  });
  assert.equal('secret' in result, false);
});

test('updating credential secret revokes dependent sessions', async () => {
  const calls: string[] = [];
  await new UpdateCredentialSecretUseCase(
    { assertCredentialAccess: () => calls.push('authorize') } as never,
    {
      requireHandle: async () => ({ id: 'c1', ownerType: 'user', ownerId: 'user-1' }),
      updateSecret: async () => calls.push('update')
    } as never,
    { revokeByCredential: async () => calls.push('revoke') } as never,
    clock
  ).execute({ actor, credentialId: 'c1', secret: { token: 'new' } });
  assert.deepEqual(calls, ['authorize', 'update', 'revoke']);
});

test('credential, network, and plugin mutations invalidate only after persistence succeeds', async () => {
  const calls: string[] = [];
  const invalidation = {
    invalidate: async (event: { type: string }) => calls.push(`invalidate:${event.type}`)
  };

  await new UpdateCredentialSecretUseCase(
    { assertCredentialAccess: () => calls.push('credential:authorize') } as never,
    {
      requireHandle: async () => ({ id: 'c1', ownerType: 'user', ownerId: 'user-1' }),
      updateSecret: async () => calls.push('credential:update')
    } as never,
    { revokeByCredential: async () => calls.push('credential:legacy-revoke') } as never,
    clock,
    invalidation
  ).execute({ actor, credentialId: 'c1', secret: { token: 'new' } });

  await new UpdateNetworkProfileUseCase(
    { assertNetworkAccess: () => calls.push('network:authorize') } as never,
    {
      requireStoredHandle: async () => ({ id: 'n1', ownerType: 'user', ownerId: 'user-1' }),
      update: async () => calls.push('network:update')
    } as never,
    clock,
    invalidation
  ).execute({ actor, profileId: 'n1', patch: { name: 'Updated' } });

  await new EnablePluginUseCase(
    { requireRole: () => calls.push('plugin:authorize') } as never,
    {
      activate: async () => {
        calls.push('plugin:activate');
        return { status: 'active' };
      }
    },
    invalidation
  ).execute({ actor, pluginId: 'demo', version: '2.0.0' });

  assert.deepEqual(calls, [
    'credential:authorize',
    'credential:update',
    'invalidate:credential-updated',
    'network:authorize',
    'network:update',
    'invalidate:network-profile-updated',
    'plugin:authorize',
    'plugin:activate',
    'invalidate:plugin-activated'
  ]);
});

test('network profile creation enforces ownership and returns metadata only', async () => {
  const result = await new CreateNetworkProfileUseCase(
    { assertNetworkAccess: () => undefined } as never,
    { save: async () => undefined } as never,
    ids,
    clock
  ).execute({
    actor,
    ownerType: 'user',
    name: 'EU direct',
    routeType: 'direct',
    regions: ['eu'],
    tags: [],
    config: { password: 'secret' }
  });
  assert.deepEqual(result, {
    id: 'generated-1',
    name: 'EU direct',
    ownerType: 'user',
    ownerId: 'user-1',
    routeType: 'direct'
  });
  assert.equal('config' in result, false);
});

test('credential login returns public authentication metadata without session material', async () => {
  const result = await new LoginCredentialUseCase(
    { requireRole: () => undefined } as never,
    {
      credentials: {
        requireHandle: async () => ({
          id: 'c1',
          ownerType: 'user',
          ownerId: 'user-1',
          pluginId: 'demo',
          strategy: 'bearer-token'
        })
      },
      plugins: { findActive: async () => ({ version: '1.0.0' }) },
      networks: { findHandleById: async () => undefined },
      authentication: {
        login: async () => ({
          status: 'authenticated',
          session: {
            kind: 'headers',
            headers: { authorization: 'Bearer top-secret' },
            networkBinding: 'none'
          }
        })
      }
    } as never
  ).execute({ actor, credentialId: 'c1' });

  assert.deepEqual(result, { status: 'authenticated' });
  assert.equal(JSON.stringify(result).includes('top-secret'), false);
});

test('challenge response uses actor ownership and source-manager role', async () => {
  const calls: unknown[] = [];
  const result = await new RespondAuthChallengeUseCase(
    { requireRole: (_actor: unknown, role: string) => calls.push(role) } as never,
    {
      respond: async (input: unknown) => {
        calls.push(input);
        return {
          status: 'authenticated',
          session: {
            kind: 'cookies',
            cookies: [{ name: 'session', value: 'top-secret' }],
            networkBinding: 'none'
          }
        };
      }
    } as never
  ).execute({ actor, challengeId: 'ch1', response: { type: 'otp', code: '123456' } });
  assert.deepEqual(result, { status: 'authenticated' });
  assert.deepEqual(calls, [
    'source-manager',
    { challengeId: 'ch1', ownerId: 'user-1', response: { type: 'otp', code: '123456' } }
  ]);
});
