import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const TEST_ORIGIN = 'http://novel-tool.test';

function requestPath(input: string | URL | Request): string {
  const value = input instanceof Request ? input.url : String(input);
  return new URL(value, TEST_ORIGIN).pathname;
}

const entityRoot = 'apps/web/src/entities';
const slices = [
  'source-plugin',
  'source-credential',
  'source-network-profile',
  'source-auth-challenge'
] as const;

async function readTree(directory: string, root = directory): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target, root));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

async function assertSliceShape(slice: (typeof slices)[number]) {
  for (const directory of ['api', 'model', 'ui', 'i18n']) {
    assert.equal((await stat(join(entityRoot, slice, directory))).isDirectory(), true);
  }
  assert.equal((await stat(join(entityRoot, slice, 'index.ts'))).isFile(), true);
}

test('Source Reader entity public APIs expose reads, keys, invalidation, UI, and catalogs', async () => {
  const plugin = await import('../../apps/web/src/entities/source-plugin/index.ts');
  const credential = await import('../../apps/web/src/entities/source-credential/index.ts');
  const network = await import('../../apps/web/src/entities/source-network-profile/index.ts');
  const challenge = await import('../../apps/web/src/entities/source-auth-challenge/index.ts');

  assert.equal(typeof plugin.useSourcePlugins, 'function');
  assert.equal(typeof plugin.useSourcePluginDiagnostics, 'function');
  assert.equal(typeof plugin.useSourcePluginHealth, 'function');
  assert.equal(typeof plugin.useSourcePluginPermissions, 'function');
  assert.deepEqual(plugin.sourcePluginKeys.list(), ['source-reader', 'plugins']);
  assert.deepEqual(plugin.sourcePluginKeys.detail('plugin/a'), [
    'source-reader',
    'plugins',
    'plugin/a'
  ]);
  assert.equal(typeof plugin.sourcePluginInvalidation.invalidateAll, 'function');
  assert.equal(typeof plugin.SourcePluginRow, 'function');
  assert.equal(plugin.sourcePluginCatalogs.en['sources.plugins.version'], 'Version {value}');
  assert.equal(
    plugin.sourcePluginCatalogs.en['sources.plugins.latestVersion'],
    'Latest installed version'
  );
  assert.equal(plugin.sourcePluginCatalogs.en['sources.plugins.runningVersion'], 'Running version');

  assert.equal(typeof credential.useSourceCredentials, 'function');
  assert.deepEqual(credential.sourceCredentialKeys.list(), ['source-reader', 'credentials']);
  assert.equal(typeof credential.sourceCredentialInvalidation.invalidateAll, 'function');
  assert.equal(typeof credential.SourceCredentialRow, 'function');
  assert.equal(credential.sourceCredentialCatalogs.en['sources.common.system'], 'System');

  assert.equal(typeof network.useSourceNetworkProfiles, 'function');
  assert.deepEqual(network.sourceNetworkProfileKeys.list(), ['source-reader', 'network-profiles']);
  assert.equal(typeof network.sourceNetworkProfileInvalidation.invalidateAll, 'function');
  assert.equal(typeof network.SourceNetworkProfileRow, 'function');
  assert.equal(network.sourceNetworkProfileCatalogs.vi['sources.common.user'], 'Người dùng');

  assert.equal(typeof challenge.useSourceAuthChallenges, 'function');
  assert.equal(typeof challenge.useSourceAuthChallenge, 'function');
  assert.deepEqual(challenge.sourceAuthChallengeKeys.detail('challenge/a'), [
    'source-reader',
    'auth-challenges',
    'challenge/a'
  ]);
  assert.equal(typeof challenge.sourceAuthChallengeInvalidation.invalidateAll, 'function');
  assert.equal(typeof challenge.SourceAuthChallengeRow, 'function');
  assert.equal(
    challenge.sourceAuthChallengeCatalogs.en['sources.challenges.expires'],
    'Expires {value}'
  );

  for (const slice of slices) await assertSliceShape(slice);
});

test('Source Reader entity clients preserve GET contracts and normalize plugin identifiers', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses: unknown[] = [
    [
      {
        pluginId: 'plugin-fallback',
        name: 'Fallback Plugin',
        latestVersion: '1.0.0',
        activeVersion: '1.0.0',
        trustLevel: 'built-in',
        status: 'active',
        enabled: true,
        capabilities: ['metadata'],
        domains: ['example.com'],
        permissionsPending: false
      }
    ],
    {},
    {},
    [],
    [],
    [],
    [],
    {}
  ];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: responses.shift(), error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const plugin = await import('../../apps/web/src/entities/source-plugin/index.ts');
    const credential = await import('../../apps/web/src/entities/source-credential/index.ts');
    const network = await import('../../apps/web/src/entities/source-network-profile/index.ts');
    const challenge = await import('../../apps/web/src/entities/source-auth-challenge/index.ts');

    const plugins = await plugin.listSourcePlugins();
    await plugin.getSourcePluginDiagnostics('plugin/a');
    await plugin.getSourcePluginHealth('plugin/a');
    await plugin.listSourcePluginPermissions('plugin/a');
    await credential.listSourceCredentials();
    await network.listSourceNetworkProfiles();
    await challenge.listSourceAuthChallenges();
    await challenge.getSourceAuthChallenge('challenge/a');

    assert.equal(plugins[0]?.id, 'plugin-fallback');
    assert.equal(plugins[0]?.latestVersion, '1.0.0');
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map((request) => requestPath(request.url)),
    [
      '/api/source-reader/plugins',
      '/api/source-reader/plugins/plugin%2Fa',
      '/api/source-reader/plugins/plugin%2Fa/health',
      '/api/source-reader/plugins/plugin%2Fa/permissions',
      '/api/source-reader/credentials',
      '/api/source-reader/network-profiles',
      '/api/source-reader/auth/challenges',
      '/api/source-reader/auth/challenges/challenge%2Fa'
    ]
  );
  for (const request of requests) assert.equal(request.init?.method, undefined);
});

test('Source Reader entity metadata stays redacted and contains no administration mutations', async () => {
  const source = (
    await Promise.all(slices.map((slice) => readTree(`${entityRoot}/${slice}`)))
  ).join('\n');

  assert.doesNotMatch(source, /passwordValue|cookieValue|tokenValue|secretValue/);
  assert.doesNotMatch(
    source,
    /SourceReaderCredentialCreateRequest|SourceReaderCredentialSecretRequest|SourceReaderCredentialLoginRequest|SourceReaderNetworkProfileCreateRequest|SourceReaderNetworkProfileUpdateRequest|SourceReaderAuthChallengeResponse|SourceReaderAuthenticationResult/
  );
  assert.doesNotMatch(
    source,
    /installSourcePlugin|enableSourcePlugin|disableSourcePlugin|removeSourcePlugin|createSourceCredential|updateSourceCredential|deleteSourceCredential|loginSourceCredential|logoutSourceCredential|testSourceCredential|createSourceNetworkProfile|updateSourceNetworkProfile|deleteSourceNetworkProfile|testSourceNetworkProfile|respondSourceAuthChallenge|cancelSourceAuthChallenge|useMutation/
  );
  assert.doesNotMatch(
    source,
    /method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]PATCH|method:\s*['"]DELETE/
  );
});

test('Source Reader invalidation adapters target only their owned collections', async () => {
  const plugin = await import('../../apps/web/src/entities/source-plugin/index.ts');
  const credential = await import('../../apps/web/src/entities/source-credential/index.ts');
  const network = await import('../../apps/web/src/entities/source-network-profile/index.ts');
  const challenge = await import('../../apps/web/src/entities/source-auth-challenge/index.ts');
  const calls: Array<readonly unknown[]> = [];
  const client = {
    invalidateQueries({ queryKey }: { queryKey: readonly unknown[] }) {
      calls.push(queryKey);
      return Promise.resolve();
    }
  };

  await plugin.sourcePluginInvalidation.invalidateAll(client as never);
  await credential.sourceCredentialInvalidation.invalidateAll(client as never);
  await network.sourceNetworkProfileInvalidation.invalidateAll(client as never);
  await challenge.sourceAuthChallengeInvalidation.invalidateAll(client as never);

  assert.deepEqual(calls, [
    ['source-reader', 'plugins'],
    ['source-reader', 'credentials'],
    ['source-reader', 'network-profiles'],
    ['source-reader', 'auth-challenges']
  ]);
});
