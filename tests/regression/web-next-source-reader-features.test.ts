import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';

const featureRoot = 'apps/web-next/src/features';
const slices = [
  'install-source-plugin',
  'manage-source-plugins',
  'review-source-permissions',
  'test-source-plugin',
  'manage-source-credential',
  'authenticate-source-credential',
  'manage-source-network-profile',
  'resolve-source-auth-challenge',
  'inspect-source-url'
] as const;

async function readTree(
  directory: string,
  root = directory,
  excluded = new Set<string>()
): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    const relativePath = relative(root, target);
    if (excluded.has(relativePath)) continue;
    if (entry.isDirectory()) parts.push(await readTree(target, root, excluded));
    else parts.push(`\n/* ${relativePath} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

test('plugin toggle rolls back cached state when the server rejects the write', async () => {
  const plugins = await import('../../apps/web-next/src/features/manage-source-plugins/index.ts');
  const entities = await import('../../apps/web-next/src/entities/source-plugin/index.ts');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(entities.sourcePluginKeys.list(), [
    {
      id: 'plugin-1',
      name: 'Plugin',
      trustLevel: 'signed',
      status: 'active',
      enabled: true,
      capabilities: [],
      domains: [],
      permissionsPending: false
    }
  ]);
  const action = plugins.createPluginToggleAction({
    enable: async () => {
      throw new Error('rejected');
    },
    disable: async () => {
      throw new Error('rejected');
    }
  });

  await assert.rejects(() =>
    action.execute(client, { pluginId: 'plugin-1', version: '1.0.0', enabled: false })
  );
  assert.equal(client.getQueryData<any[]>(entities.sourcePluginKeys.list())?.[0]?.enabled, true);
});

test('Source Reader feature clients preserve frozen write and inspection contracts', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const path = new URL(String(input)).pathname;
    if (
      path.endsWith('/disable') ||
      path.endsWith('/permissions/approve') ||
      path.endsWith('/permissions/deny') ||
      (path.includes('/credentials/') && (init?.method === 'PATCH' || init?.method === 'DELETE')) ||
      path.endsWith('/logout') ||
      (path.includes('/network-profiles/') && init?.method === 'PATCH') ||
      (path.includes('/network-profiles/') && init?.method === 'DELETE') ||
      path.endsWith('/cancel') ||
      (path.includes('/plugins/') && init?.method === 'DELETE')
    ) {
      return new Response(null, { status: 204 });
    }
    const data = path.includes('/plugins/install')
      ? { pluginId: 'plugin-1', version: '1.0.0', status: 'installed' }
      : path.endsWith('/enable')
        ? { pluginId: 'plugin-1', version: '1.0.0', status: 'active', warnings: [] }
        : path.endsWith('/test')
          ? { status: 'healthy' }
          : path === '/api/source-reader/credentials'
            ? {
                id: 'credential-1',
                name: 'Credential',
                ownerType: 'user',
                strategy: 'cookie-import'
              }
            : path.endsWith('/login') || path.endsWith('/respond')
              ? { status: 'authenticated' }
              : path === '/api/source-reader/network-profiles'
                ? { id: 'network-1', name: 'Route', ownerType: 'user', routeType: 'direct' }
                : {
                    data: {
                      normalizedUrl: 'https://example.test/book',
                      domain: 'example.test',
                      pageType: 'novel'
                    },
                    source: {
                      pluginId: 'plugin-1',
                      pluginVersion: '1.0.0',
                      domain: 'example.test',
                      capability: 'identify'
                    }
                  };
    return new Response(JSON.stringify({ data, error: null }), {
      status:
        path.includes('/install') ||
        path === '/api/source-reader/credentials' ||
        path.endsWith('/login')
          ? 202
          : 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' }
    });
  }) as typeof fetch;

  try {
    const install = await import('../../apps/web-next/src/features/install-source-plugin/index.ts');
    const plugins = await import('../../apps/web-next/src/features/manage-source-plugins/index.ts');
    const permissions =
      await import('../../apps/web-next/src/features/review-source-permissions/index.ts');
    const testPlugin = await import('../../apps/web-next/src/features/test-source-plugin/index.ts');
    const credentials =
      await import('../../apps/web-next/src/features/manage-source-credential/index.ts');
    const auth =
      await import('../../apps/web-next/src/features/authenticate-source-credential/index.ts');
    const networks =
      await import('../../apps/web-next/src/features/manage-source-network-profile/index.ts');
    const challenges =
      await import('../../apps/web-next/src/features/resolve-source-auth-challenge/index.ts');
    const inspector = await import('../../apps/web-next/src/features/inspect-source-url/index.ts');

    await install.installSourcePlugin(new File([new Uint8Array([1, 2, 3])], 'plugin.zip'));
    await plugins.enableSourcePlugin('plugin/1', '1.0.0');
    await plugins.disableSourcePlugin('plugin/1');
    await plugins.removeSourcePlugin('plugin/1');
    await permissions.reviewSourcePermissions('plugin/1', '1.0.0', true);
    await permissions.reviewSourcePermissions('plugin/1', '1.0.0', false);
    await testPlugin.testSourcePlugin('plugin/1');
    await credentials.createSourceCredential({
      ownerType: 'user',
      name: 'Credential',
      strategy: 'cookie-import',
      secret: { cookie: 'secret-cookie' }
    });
    await credentials.updateSourceCredentialSecret('credential/1', { cookie: 'new-cookie' });
    await credentials.deleteSourceCredential('credential/1');
    await auth.loginSourceCredential('credential/1', { networkProfileId: 'network/1' });
    await auth.logoutSourceCredential('credential/1');
    await auth.testSourceCredential('credential/1', {});
    await networks.createSourceNetworkProfile({
      ownerType: 'user',
      name: 'Route',
      routeType: 'direct',
      regions: [],
      tags: []
    });
    await networks.updateSourceNetworkProfile('network/1', { enabled: false });
    await networks.testSourceNetworkProfile('network/1');
    await networks.deleteSourceNetworkProfile('network/1');
    await challenges.respondSourceAuthChallenge('challenge/1', { type: 'otp', code: '123456' });
    await challenges.cancelSourceAuthChallenge('challenge/1');
    await inspector.runSourceInspection({
      operation: 'identify',
      request: { url: 'https://example.test/book', timeoutMs: 15_000 }
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ url, init }) => ({
      path: new URL(url).pathname,
      method: init?.method,
      contentType: new Headers(init?.headers).get('content-type'),
      body:
        typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof FormData
            ? 'form-data'
            : undefined
    })),
    [
      {
        path: '/api/source-reader/plugins/install',
        method: 'POST',
        contentType: null,
        body: 'form-data'
      },
      {
        path: '/api/source-reader/plugins/plugin%2F1/enable',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0.0' })
      },
      {
        path: '/api/source-reader/plugins/plugin%2F1/disable',
        method: 'POST',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/plugins/plugin%2F1',
        method: 'DELETE',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/plugins/plugin%2F1/permissions/approve',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0.0' })
      },
      {
        path: '/api/source-reader/plugins/plugin%2F1/permissions/deny',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0.0' })
      },
      {
        path: '/api/source-reader/plugins/plugin%2F1/test',
        method: 'POST',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/credentials',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({
          ownerType: 'user',
          name: 'Credential',
          strategy: 'cookie-import',
          secret: { cookie: 'secret-cookie' }
        })
      },
      {
        path: '/api/source-reader/credentials/credential%2F1',
        method: 'PATCH',
        contentType: 'application/json',
        body: JSON.stringify({ secret: { cookie: 'new-cookie' } })
      },
      {
        path: '/api/source-reader/credentials/credential%2F1',
        method: 'DELETE',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/credentials/credential%2F1/login',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ networkProfileId: 'network/1' })
      },
      {
        path: '/api/source-reader/credentials/credential%2F1/logout',
        method: 'POST',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/credentials/credential%2F1/test',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({})
      },
      {
        path: '/api/source-reader/network-profiles',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({
          ownerType: 'user',
          name: 'Route',
          routeType: 'direct',
          regions: [],
          tags: []
        })
      },
      {
        path: '/api/source-reader/network-profiles/network%2F1',
        method: 'PATCH',
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false })
      },
      {
        path: '/api/source-reader/network-profiles/network%2F1/test',
        method: 'POST',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/network-profiles/network%2F1',
        method: 'DELETE',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/auth/challenges/challenge%2F1/respond',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ response: { type: 'otp', code: '123456' } })
      },
      {
        path: '/api/source-reader/auth/challenges/challenge%2F1/cancel',
        method: 'POST',
        contentType: 'application/json',
        body: undefined
      },
      {
        path: '/api/source-reader/identify',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.test/book', timeoutMs: 15000 })
      }
    ]
  );
});

test('credential and proxy secrets are feature-local and cleared after use or close', async () => {
  const credentials =
    await import('../../apps/web-next/src/features/manage-source-credential/index.ts');
  const networks =
    await import('../../apps/web-next/src/features/manage-source-network-profile/index.ts');

  const secret = credentials.buildCredentialSecret('basic-auth', {
    cookie: '',
    token: '',
    username: ' alice ',
    password: 'password-1',
    loginUrl: '',
    customKey: '',
    customValue: ''
  });
  assert.deepEqual(secret, { username: 'alice', password: 'password-1' });
  assert.deepEqual(credentials.clearCredentialSecrets(), {
    cookie: '',
    token: '',
    username: '',
    password: '',
    loginUrl: '',
    customKey: '',
    customValue: ''
  });

  const profile = networks.createEmptyNetworkProfileForm();
  assert.equal(profile.proxyPassword, '');
  assert.equal(
    networks.clearNetworkProfileSecret({ ...profile, proxyPassword: 'secret' }).proxyPassword,
    ''
  );

  const entitySource = await readTree(
    'apps/web-next/src/entities',
    undefined,
    new Set([join('source-credential', 'i18n', 'catalog.ts')])
  );
  assert.doesNotMatch(entitySource, /CredentialSecret|proxyPassword|cookie-import|bearer-token/);
});

test('feature errors expose only public code and request ID, never submitted or response secrets', async () => {
  const { ApiError, getPublicErrorDescription } =
    await import('../../apps/web-next/src/shared/api/index.ts');
  const error = new ApiError('server echoed token=top-secret', {
    status: 400,
    code: 'AUTHENTICATION_FAILED',
    details: { password: 'top-secret', requestId: 'request-details' },
    requestId: 'request-header'
  });
  const description = getPublicErrorDescription(error);
  assert.match(description, /AUTHENTICATION_FAILED/);
  assert.match(description, /request-header/);
  assert.doesNotMatch(description, /top-secret|password|token|server echoed/);

  const source = (
    await Promise.all(slices.map((slice) => readTree(join(featureRoot, slice))))
  ).join('\n');
  assert.doesNotMatch(source, /toast\([^)]*(password|cookie|token|proxyPassword)/s);
  assert.doesNotMatch(source, /error\.details|JSON\.stringify\(error/);
  assert.match(source, /getPublicErrorDescription/);
});

test('Task 8 public APIs expose administration actions, hooks, catalogs, and reusable UI', async () => {
  const modules = await Promise.all(
    slices.map((slice) => import(`../../apps/web-next/src/features/${slice}/index.ts`))
  );
  for (const [index, module] of modules.entries()) {
    assert.equal((await stat(join(featureRoot, slices[index], 'index.ts'))).isFile(), true);
    assert.ok(Object.keys(module).some((name) => name.endsWith('Catalogs')));
  }

  assert.equal(typeof modules[0].InstallSourcePluginForm, 'function');
  assert.equal(typeof modules[1].createPluginToggleAction, 'function');
  assert.equal(typeof modules[1].SourcePluginEnableSwitch, 'function');
  assert.equal(typeof modules[2].ReviewSourcePermissions, 'function');
  assert.equal(typeof modules[3].TestSourcePluginButton, 'function');
  assert.equal(typeof modules[4].CreateSourceCredentialButton, 'function');
  assert.equal(typeof modules[5].SourceCredentialAuthActions, 'function');
  assert.equal(typeof modules[6].SourceNetworkProfileActions, 'function');
  assert.equal(typeof modules[7].ResolveSourceAuthChallenge, 'function');
  assert.equal(typeof modules[8].InspectSourceUrl, 'function');
});

test('Source Reader writes stay feature-owned and use only public entity invalidation adapters', async () => {
  const upperLayers = [
    await readTree('apps/web-next/src/app', undefined, new Set([join('i18n', 'catalog.ts')])),
    await readTree('apps/web-next/src/pages'),
    await readTree('apps/web-next/src/entities')
  ].join('\n');
  assert.doesNotMatch(
    upperLayers,
    /installSourcePlugin|enableSourcePlugin|createSourceCredential|updateSourceNetworkProfile|respondSourceAuthChallenge|method:\s*['"](?:POST|PUT|PATCH|DELETE)/
  );

  const source = (
    await Promise.all(slices.map((slice) => readTree(join(featureRoot, slice))))
  ).join('\n');
  assert.doesNotMatch(
    source,
    /features\/(?:install-source-plugin|manage-source-plugins|review-source-permissions|test-source-plugin|manage-source-credential|authenticate-source-credential|manage-source-network-profile|resolve-source-auth-challenge|inspect-source-url)\//
  );
  assert.match(source, /sourcePluginInvalidation/);
  assert.match(source, /sourceCredentialInvalidation/);
  assert.match(source, /sourceNetworkProfileInvalidation/);
  assert.match(source, /sourceAuthChallengeInvalidation/);
});
