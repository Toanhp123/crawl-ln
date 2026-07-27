import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourcePlugin } from '../../apps/web/src/entities/source-plugin/model/types.ts';

const TEST_ORIGIN = 'http://novel-tool.test';

function requestPath(input: string | URL | Request): string {
  const value = input instanceof Request ? input.url : String(input);
  return new URL(value, TEST_ORIGIN).pathname;
}

function inactivePlugin(overrides: Partial<SourcePlugin> = {}): SourcePlugin {
  return {
    id: 'fixture-source',
    name: 'Fixture Source',
    latestVersion: '2.0.0',
    trustLevel: 'local-unverified',
    status: 'pending-approval',
    enabled: false,
    capabilities: ['metadata'],
    domains: ['fixture.test'],
    permissionsPending: true,
    ...overrides
  };
}

test('plugin normalization preserves latestVersion and permission review targets that exact version', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (requestPath(input).endsWith('/permissions/approve')) {
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        data: [inactivePlugin()],
        error: null
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const entities = await import('../../apps/web/src/entities/source-plugin/index.ts');
    const permissions =
      await import('../../apps/web/src/features/review-source-permissions/index.ts');
    const [plugin] = await entities.listSourcePlugins();
    assert.equal(plugin?.latestVersion, '2.0.0');
    assert.equal(plugin && 'activeVersion' in plugin, false);
    await permissions.reviewSourcePermissions(plugin!.id, plugin!.latestVersion, true);
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ url, init }) => ({
      path: requestPath(url),
      method: init?.method,
      body: init?.body
    })),
    [
      { path: '/api/source-reader/plugins', method: undefined, body: undefined },
      {
        path: '/api/source-reader/plugins/fixture-source/permissions/approve',
        method: 'POST',
        body: JSON.stringify({ version: '2.0.0' })
      }
    ]
  );
});

test('plugin normalization rejects descriptors without latestVersion instead of guessing', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [{ ...inactivePlugin(), latestVersion: undefined }],
        error: null
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;
  try {
    const { listSourcePlugins } =
      await import('../../apps/web/src/entities/source-plugin/index.ts');
    await assert.rejects(() => listSourcePlugins(), /invalid plugin descriptor/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('activation state gates pending approval and exposes the exact latest target', async () => {
  const plugins = await import('../../apps/web/src/features/manage-source-plugins/index.ts');
  const pending = inactivePlugin();
  const approved = inactivePlugin({ status: 'installed', permissionsPending: false });
  const upgrade = inactivePlugin({
    activeVersion: '1.0.0',
    status: 'active',
    enabled: true,
    permissionsPending: false
  });
  const pendingUpgrade = inactivePlugin({
    activeVersion: '1.0.0',
    status: 'active',
    enabled: true,
    permissionsPending: true
  });

  assert.deepEqual(plugins.getSourcePluginActivationState(pending), {
    targetVersion: '2.0.0',
    blockedByPermissions: true,
    hasUpgrade: false,
    canEnable: false,
    canActivateLatest: false
  });
  assert.deepEqual(plugins.getSourcePluginActivationState(approved), {
    targetVersion: '2.0.0',
    blockedByPermissions: false,
    hasUpgrade: false,
    canEnable: true,
    canActivateLatest: false
  });
  assert.deepEqual(plugins.getSourcePluginActivationState(upgrade), {
    targetVersion: '2.0.0',
    blockedByPermissions: false,
    hasUpgrade: true,
    canEnable: false,
    canActivateLatest: true
  });
  assert.deepEqual(plugins.getSourcePluginActivationState(pendingUpgrade), {
    targetVersion: '2.0.0',
    blockedByPermissions: true,
    hasUpgrade: true,
    canEnable: false,
    canActivateLatest: false
  });
});

test('pending approval disables the detail switch but keeps the compact review shortcut', async () => {
  const plugins = await import('../../apps/web/src/features/manage-source-plugins/index.ts');
  const pending = inactivePlugin();
  const approved = inactivePlugin({ status: 'installed', permissionsPending: false });

  assert.equal(
    plugins.isSourcePluginEnableSwitchDisabled(pending, {
      compact: false,
      togglePending: false,
      toggleOwnsPlugin: false
    }),
    true
  );
  assert.equal(
    plugins.isSourcePluginEnableSwitchDisabled(pending, {
      compact: true,
      togglePending: false,
      toggleOwnsPlugin: false
    }),
    false
  );
  assert.equal(
    plugins.isSourcePluginEnableSwitchDisabled(approved, {
      compact: false,
      togglePending: false,
      toggleOwnsPlugin: false
    }),
    false
  );
});

test('initial enable action sends the latest reviewed version', async () => {
  const plugins = await import('../../apps/web/src/features/manage-source-plugins/index.ts');
  const entities = await import('../../apps/web/src/entities/source-plugin/index.ts');
  const { createQueryClient } = await import('../../apps/web/src/shared/api/index.ts');
  const client = createQueryClient();
  const plugin = inactivePlugin({ status: 'installed', permissionsPending: false });
  client.setQueryData(entities.sourcePluginKeys.list(), [plugin]);
  const enabled: Array<[string, string]> = [];
  const action = plugins.createPluginToggleAction({
    enable: async (pluginId, version) => {
      enabled.push([pluginId, version]);
    },
    disable: async () => undefined
  });

  const state = plugins.getSourcePluginActivationState(plugin);
  await action.execute(client, {
    pluginId: plugin.id,
    version: state.targetVersion,
    enabled: true
  });
  assert.deepEqual(enabled, [['fixture-source', '2.0.0']]);
});

test('activate-latest client sends the exact selected version to the enable endpoint', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        data: {
          pluginId: 'fixture-source',
          version: '2.0.0',
          status: 'active',
          warnings: []
        },
        error: null
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const plugins = await import('../../apps/web/src/features/manage-source-plugins/index.ts');
    await plugins.activateLatestSourcePlugin('fixture-source', '2.0.0');
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ url, init }) => ({
      path: requestPath(url),
      method: init?.method,
      body: init?.body
    })),
    [
      {
        path: '/api/source-reader/plugins/fixture-source/enable',
        method: 'POST',
        body: JSON.stringify({ version: '2.0.0' })
      }
    ]
  );
});
