import assert from 'node:assert/strict';
import test from 'node:test';
import { LogoutCredentialUseCase } from '../../apps/api-next/src/modules/source-reader/application/admin/use-cases/credentials/manage-credentials.usecase.ts';
import {
  DenyPluginPermissionsUseCase,
  RemovePluginUseCase
} from '../../apps/api-next/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugins.usecase.ts';

const actor = { id: 'user-1', roles: ['source-admin'] as const };

test('removing a plugin unregisters its active runtime before deleting persistence', async () => {
  const calls: string[] = [];
  const useCase = new RemovePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    {
      findLatestVersion: async () => {
        calls.push('load');
        return { pluginId: 'contract-plugin' };
      },
      remove: async () => void calls.push('remove')
    } as never,
    { invalidate: async () => void calls.push('invalidate') }
  );

  await useCase.execute({ actor, pluginId: 'contract-plugin' });

  assert.deepEqual(calls, ['authorize', 'load', 'disable', 'remove', 'invalidate']);
});

test('removing an unpersisted built-in id does not unregister its runtime', async () => {
  const calls: string[] = [];
  const useCase = new RemovePluginUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    { disable: async () => void calls.push('disable') },
    {
      findLatestVersion: async () => {
        calls.push('load');
        return undefined;
      },
      remove: async () => void calls.push('remove')
    } as never,
    { invalidate: async () => void calls.push('invalidate') }
  );

  await useCase.execute({ actor, pluginId: 'novelcool' });

  assert.deepEqual(calls, ['authorize', 'load', 'remove', 'invalidate']);
});

test('credential logout authorizes ownership before revoking sessions', async () => {
  const calls: string[] = [];
  const useCase = new LogoutCredentialUseCase(
    {
      requireRole: () => calls.push('role'),
      assertCredentialAccess: () => calls.push('ownership')
    } as never,
    {
      requireHandle: async () => {
        calls.push('load');
        return { id: 'credential-1', ownerType: 'user', ownerId: 'user-1' };
      }
    },
    { logout: async () => void calls.push('logout') }
  );

  await useCase.execute({ actor, credentialId: 'credential-1' });

  assert.deepEqual(calls, ['role', 'load', 'ownership', 'logout']);
});

test('denying permissions for the active version unregisters its runtime', async () => {
  const calls: string[] = [];
  const useCase = new DenyPluginPermissionsUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    {
      findActive: async () => {
        calls.push('load-active');
        return { version: '1.0.0' };
      },
      denyPermissions: async () => void calls.push('deny')
    } as never,
    { disable: async () => void calls.push('disable') },
    { invalidate: async () => void calls.push('invalidate') }
  );

  await useCase.execute({ actor, pluginId: 'contract-plugin', version: '1.0.0' });

  assert.deepEqual(calls, ['authorize', 'load-active', 'deny', 'disable', 'invalidate']);
});

test('denying permissions for an inactive version leaves the active runtime running', async () => {
  const calls: string[] = [];
  const useCase = new DenyPluginPermissionsUseCase(
    { requireRole: () => calls.push('authorize') } as never,
    {
      findActive: async () => {
        calls.push('load-active');
        return { version: '2.0.0' };
      },
      denyPermissions: async () => void calls.push('deny')
    } as never,
    { disable: async () => void calls.push('disable') },
    { invalidate: async () => void calls.push('invalidate') }
  );

  await useCase.execute({ actor, pluginId: 'contract-plugin', version: '1.0.0' });

  assert.deepEqual(calls, ['authorize', 'load-active', 'deny']);
});
