import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID, sign as signPayload } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { CandidateResolver } from '../../apps/api/src/modules/source-reader/application/services/candidate-resolver.ts';
import { HealthFallbackPolicy } from '../../apps/api/src/modules/source-reader/application/services/health-fallback.policy.ts';
import { InvocationCoordinator } from '../../apps/api/src/modules/source-reader/application/services/invocation-coordinator.ts';
import { PaginationCoordinator } from '../../apps/api/src/modules/source-reader/application/services/pagination-coordinator.ts';
import { ReaderCachePolicy } from '../../apps/api/src/modules/source-reader/application/services/reader-cache-policy.ts';
import { RuntimeContextResolverService } from '../../apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts';
import { SourceResultValidator } from '../../apps/api/src/modules/source-reader/application/services/source-result-validator.ts';
import { SourceReaderFacade } from '../../apps/api/src/modules/source-reader/application/source-reader.facade.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { parseSourcePluginManifest } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin-manifest.schema.ts';
import { browserSessionIdentityKey } from '../../apps/api/src/modules/source-reader/infrastructure/browser/browser-runtime.coordinator.ts';
import { buildChromiumLaunchOptions } from '../../apps/api/src/modules/source-reader/infrastructure/browser/browser-launch-options.ts';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/hmac-cursor.codec.ts';
import { ExternalProcessSupervisor } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { PipelinePluginRegistryAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/pipeline-plugin-registry.adapter.ts';
import { PipelineRuntimeContextAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/pipeline-runtime-context.adapter.ts';
import { PipelineSourceReaderInvocationAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/pipeline-source-reader-invocation.adapter.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { RuntimeRouter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts';
import { CheerioHtmlParserAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/cheerio-html-parser.adapter.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/infrastructure/migrations/001-source-reader-schema.ts';
import { NetworkRouteResolver } from '../../apps/api/src/modules/source-reader/infrastructure/network/network-route.resolver.ts';
import { ProxyAgentFactory } from '../../apps/api/src/modules/source-reader/infrastructure/network/proxy-agent.factory.ts';
import { RouteAwareHttpClientAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/network/route-aware-http-client.adapter.ts';
import {
  createNovelCoolPlugin,
  novelCoolPlugin
} from '../../apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts';
import { novelCoolChapterUrlKey } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool-chapter-url-key.ts';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SqliteAuthChallengeRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-auth-challenge.repository.ts';
import { SqliteCredentialRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';
import { SqliteNetworkProfileRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts';
import { PipelinePluginHealthAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/pipeline-plugin-health.adapter.ts';
import { SqlitePluginHealthRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin-health.repository.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';
import { SqliteReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-reader.cache.ts';
import { SqliteSessionRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { copySourceReaderRuntimeAssets } from '../../apps/api/scripts/build.mjs';
import { startHttpProxyServer } from '../helpers/http-proxy-server.ts';

const timestamp = '2026-07-21T00:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const externalFixture = (name: string) =>
  resolve(`tests/fixtures/source-reader/external-plugins/${name}`);

function migratedDatabase(t: test.TestContext): SqliteDatabase {
  const database = new SqliteDatabase(':memory:');
  for (const migration of sourceReaderMigrations) migration.up(database.connection);
  t.after(() => database.close());
  return database;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

const packageManifest = {
  id: 'signed-demo',
  name: 'Signed Demo',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'],
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['example.test'], priority: 10 }],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['example.test'] } }
} as const;

async function signedPackage(): Promise<{
  bytes: Uint8Array;
  publicKeyPem: string;
}> {
  const manifest = parseSourcePluginManifest(packageManifest);
  const manifestSource = JSON.stringify(manifest);
  const entrySource = 'export default () => ({})';
  const checksums = {
    'manifest.json': sha256(manifestSource),
    'dist/index.js': sha256(entrySource)
  };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const signature = signPayload(
    null,
    Buffer.from(JSON.stringify({ manifest, checksums })),
    privateKey
  ).toString('base64');
  const zip = new JSZip();
  zip.file('manifest.json', manifestSource);
  zip.file('dist/index.js', entrySource);
  zip.file('checksums.json', JSON.stringify(checksums));
  zip.file(
    'signature.json',
    JSON.stringify({ keyId: 'release-key', algorithm: 'ed25519', signature })
  );
  return {
    bytes: await zip.generateAsync({ type: 'uint8array', platform: 'UNIX' }),
    publicKeyPem: String(publicKey.export({ type: 'spki', format: 'pem' }))
  };
}

async function startDestination() {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ proxied: request.headers['x-test-proxy'] ?? null }));
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('destination did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/probe`,
    requests: () => requests,
    close: () => new Promise<void>((done) => server.close(() => done()))
  };
}

test('source reader migration creates the complete module-owned schema', (t) => {
  const database = migratedDatabase(t);
  const tables = database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'source_reader_%'")
    .all()
    .map((row) => (row as { name: string }).name)
    .sort();
  assert.deepEqual(tables, [
    'source_reader_auth_challenges',
    'source_reader_cache_entries',
    'source_reader_cache_tags',
    'source_reader_credentials',
    'source_reader_health_checks',
    'source_reader_installations',
    'source_reader_network_profiles',
    'source_reader_plugin_permissions',
    'source_reader_plugin_versions',
    'source_reader_plugins',
    'source_reader_sessions'
  ]);
  const cacheColumns = database.connection
    .prepare('PRAGMA table_info(source_reader_cache_entries)')
    .all()
    .map((row) => (row as { name: string }).name);
  assert.ok(cacheColumns.includes('extension_contract_versions_json'));
  assert.ok(cacheColumns.includes('network_identity_hash'));
});

test('api build copies the external sandbox entry into its output tree', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'api-build-assets-'));
  const sourceDirectory = resolve(
    root,
    'src/modules/source-reader/infrastructure/runtime/external-process'
  );
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(resolve(sourceDirectory, 'sandbox-entry.mjs'), 'export const sandbox = true;');
  await writeFile(
    resolve(sourceDirectory, 'sandbox-frame-bounds.mjs'),
    'export const bounds = true;'
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  await copySourceReaderRuntimeAssets({ apiRoot: root, outputRoot: resolve(root, 'dist') });

  assert.equal(
    await readFile(
      resolve(
        root,
        'dist/modules/source-reader/infrastructure/runtime/external-process/sandbox-entry.mjs'
      ),
      'utf8'
    ),
    'export const sandbox = true;'
  );
  assert.equal(
    await readFile(
      resolve(
        root,
        'dist/modules/source-reader/infrastructure/runtime/external-process/sandbox-frame-bounds.mjs'
      ),
      'utf8'
    ),
    'export const bounds = true;'
  );
});

test('package verifier accepts trusted signatures and rejects checksum tampering', async () => {
  const signed = await signedPackage();
  const verifier = new SourcePluginPackageVerifier(
    new StaticTrustStore([
      { id: 'release-key', algorithm: 'ed25519', publicKeyPem: signed.publicKeyPem }
    ])
  );
  const verified = await verifier.verify(signed.bytes);
  assert.equal(verified.signatureStatus, 'valid');
  assert.equal(verified.trustLevel, 'signed');
  assert.equal(verified.executionMode, 'isolated');

  const tampered = new JSZip();
  const manifest = JSON.stringify(parseSourcePluginManifest(packageManifest));
  tampered.file('manifest.json', manifest);
  tampered.file('dist/index.js', 'export default () => ({ tampered: true })');
  tampered.file(
    'checksums.json',
    JSON.stringify({
      'manifest.json': sha256(manifest),
      'dist/index.js': '0'.repeat(64)
    })
  );
  await assert.rejects(
    async () => verifier.verify(await tampered.generateAsync({ type: 'uint8array' })),
    /checksum mismatch/i
  );
});

test('external sandbox blocks ambient authority and preserves allowlisted SDK errors', async (t) => {
  process.env.SOURCE_READER_MASTER_KEY = 'must-not-leak';
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 20
  });
  t.after(async () => {
    delete process.env.SOURCE_READER_MASTER_KEY;
    await supervisor.stop('hostile', '1.0.0', 'test-complete');
    await supervisor.stop('sdk-errors', '1.0.0', 'test-complete');
  });
  const hostileRoot = externalFixture('hostile');
  const hostile = await supervisor.start({
    pluginId: 'hostile',
    pluginVersion: '1.0.0',
    packageRoot: hostileRoot,
    entryPath: resolve(hostileRoot, 'dist/index.js')
  });
  const hostileResult = (await hostile.request(
    {
      requestId: randomUUID(),
      operation: 'invokeCapability',
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      payload: {}
    },
    new AbortController().signal
  )) as { data: Record<string, unknown> };
  assert.equal(hostileResult.data.env, 'BLOCKED');
  assert.equal(hostileResult.data.fetch, 'undefined');
  for (const authority of ['fs', 'childProcess', 'net', 'workerThreads']) {
    assert.notEqual(hostileResult.data[authority], 'ALLOWED');
  }

  const root = await mkdtemp(resolve(tmpdir(), 'api-sdk-errors-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(
    resolve(root, 'dist/index.js'),
    `export async function invokeCapability(payload) {
      const error = new Error('challenge');
      error.name = 'SourcePluginError';
      error.code = payload.code;
      error.details = { secret: 'must-not-cross' };
      throw error;
    }`
  );
  const errors = await supervisor.start({
    pluginId: 'sdk-errors',
    pluginVersion: '1.0.0',
    packageRoot: root,
    entryPath: resolve(root, 'dist/index.js')
  });
  await assert.rejects(
    () =>
      errors.request(
        {
          requestId: randomUUID(),
          operation: 'invokeCapability',
          deadlineAt: new Date(Date.now() + 10_000).toISOString(),
          payload: { code: 'UPSTREAM_CHALLENGE_DETECTED' }
        },
        new AbortController().signal
      ),
    (error: unknown) =>
      error instanceof SourceReaderError &&
      error.code === 'UPSTREAM_CHALLENGE_DETECTED' &&
      error.details === undefined
  );
  await assert.rejects(
    () =>
      errors.request(
        {
          requestId: randomUUID(),
          operation: 'invokeCapability',
          deadlineAt: new Date(Date.now() + 10_000).toISOString(),
          payload: { code: 'PLUGIN_PERMISSION_DENIED' }
        },
        new AbortController().signal
      ),
    (error: unknown) => error instanceof SourceReaderError && error.code === 'PLUGIN_UNAVAILABLE'
  );
});

test('external sandbox rejects oversized RPC values and terminates on cancellation', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'api-rpc-bounds-'));
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(
    resolve(root, 'dist/index.js'),
    `export async function invokeCapability(payload) {
      if (payload.mode === 'hang') return new Promise(() => {});
      let value = 'leaf';
      for (let index = 0; index < 1200; index += 1) value = { nested: value };
      return { data: value };
    }`
  );
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 20
  });
  t.after(async () => {
    await supervisor.stop('rpc-bounds', '1.0.0', 'test-complete');
    await rm(root, { recursive: true, force: true });
  });
  const start = () =>
    supervisor.start({
      pluginId: 'rpc-bounds',
      pluginVersion: '1.0.0',
      packageRoot: root,
      entryPath: resolve(root, 'dist/index.js')
    });
  const handle = await start();
  await assert.rejects(
    () =>
      handle.request(
        {
          requestId: randomUUID(),
          operation: 'invokeCapability',
          deadlineAt: new Date(Date.now() + 10_000).toISOString(),
          payload: {}
        },
        new AbortController().signal
      ),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_RPC_PROTOCOL_INVALID'
  );
  assert.equal(supervisor.get('rpc-bounds', '1.0.0'), undefined);

  const restarted = await start();
  const abort = new AbortController();
  const pending = restarted.request(
    {
      requestId: randomUUID(),
      operation: 'invokeCapability',
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
      payload: { mode: 'hang' }
    },
    abort.signal
  );
  abort.abort();
  await assert.rejects(
    () => pending,
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SOURCE_READER_CANCELLED'
  );
  assert.equal(supervisor.get('rpc-bounds', '1.0.0'), undefined);
});

test('browser identity and Chromium proxy options bind account session version and route', () => {
  const base = {
    userId: 'user-1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    sourceAccountId: 'credential-1',
    credentialId: 'credential-1',
    sessionId: 'session-1',
    networkRouteId: 'proxy-a',
    networkIdentity: 'http-proxy:route-a'
  };
  const original = browserSessionIdentityKey(base);
  for (const variant of [
    { ...base, userId: 'user-2' },
    { ...base, pluginVersion: '2.0.0' },
    { ...base, credentialId: 'credential-2', sourceAccountId: 'credential-2' },
    { ...base, sessionId: 'session-2' },
    { ...base, networkRouteId: 'proxy-b', networkIdentity: 'http-proxy:route-b' }
  ]) {
    assert.notEqual(browserSessionIdentityKey(variant), original);
  }
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
});

test('NovelCool accepts the configured minimum chapter length without reading global env', async () => {
  const html = await readFile('tests/fixtures/source-reader/novelcool-chapter.html', 'utf8');
  const plugin = createNovelCoolPlugin({ minimumChapterContentChars: 10_000 });
  const context = new PluginContextFactory(
    {
      async get(url: string) {
        return { url, status: 200, headers: {}, data: html };
      },
      async post(url: string) {
        return this.get(url);
      },
      async head(url: string) {
        return { url, status: 200, headers: {}, data: '' };
      }
    },
    new CheerioHtmlParserAdapter(),
    clock,
    { info() {}, warn() {}, error() {} }
  ).create({
    pluginId: 'novelcool',
    pluginVersion: '1.0.0',
    capability: 'chapter-content',
    allowedHosts: ['novelcool.com'],
    signal: new AbortController().signal,
    runtimeContext: {
      resolvedNetworkRoute: { kind: 'direct', identity: 'direct' },
      executionMode: 'in-process',
      browserRequired: false,
      cacheIdentity: { public: 'public', network: 'direct' }
    }
  });

  await assert.rejects(
    () =>
      plugin.readChapterContent!(
        { url: 'https://www.novelcool.com/chapter/fixture-chapter-1.html' },
        context
      ),
    (error: unknown) =>
      error instanceof SourceReaderError &&
      error.code === 'PLUGIN_RESULT_INVALID' &&
      error.details?.minChapterContentChars === 10_000
  );
});

test('NovelCool deduplicates alias chapter URLs by canonical numeric id', async () => {
  const genericUrl = 'https://novelcool.com/chapter/read-online/14145402.html';
  const detailedUrl = 'https://www.novelcool.com/chapter/Chapter-655-Misha-s-Move/14145402/';
  const html = `
    <html>
      <head><title>Original</title></head>
      <body>
        <h1 class="novel-title">Original</h1>
        <div class="chapter-list">
          <a href="${genericUrl}"><span>Chapter 1</span></a>
          <a href="${detailedUrl}"><span>Chapter 655: Misha's Move</span></a>
        </div>
      </body>
    </html>
  `;
  const plugin = createNovelCoolPlugin();
  const context = new PluginContextFactory(
    {
      async get(url: string) {
        return { url, status: 200, headers: {}, data: html };
      },
      async post(url: string) {
        return this.get(url);
      },
      async head(url: string) {
        return { url, status: 200, headers: {}, data: '' };
      }
    },
    new CheerioHtmlParserAdapter(),
    clock,
    { info() {}, warn() {}, error() {} }
  ).create({
    pluginId: plugin.manifest.id,
    pluginVersion: plugin.manifest.version,
    capability: 'chapter-list',
    allowedHosts: ['novelcool.com'],
    signal: new AbortController().signal,
    runtimeContext: {
      resolvedNetworkRoute: { kind: 'direct', identity: 'direct' },
      executionMode: 'in-process',
      browserRequired: false,
      cacheIdentity: { public: 'public', network: 'direct' }
    }
  });

  const result = await plugin.readChapterList!(
    { url: 'https://www.novelcool.com/novel/original/id-269162.html' },
    context
  );

  assert.deepEqual(result.data.items, [
    {
      index: 1,
      title: "Chapter 655: Misha's Move",
      url: detailedUrl
    }
  ]);
});

test('NovelCool chapter identity owns its numeric-id alias rule', () => {
  assert.equal(
    novelCoolChapterUrlKey('https://novelcool.com/chapter/read-online/14145402.html'),
    novelCoolChapterUrlKey('https://www.novelcool.com/chapter/Chapter-655-Misha-s-Move/14145402/')
  );
  assert.notEqual(
    novelCoolChapterUrlKey('https://novelcool.com/chapter/read-online/14145402.html'),
    novelCoolChapterUrlKey('https://novelcool.com/chapter/read-online/14145403.html')
  );
});

test('credentials stay encrypted and sessions require exact plugin and route bindings', async (t) => {
  const database = migratedDatabase(t);
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 7));
  const credentials = new SqliteCredentialRepository(database, vault);
  const networks = new SqliteNetworkProfileRepository(database, vault);
  const sessions = new SqliteSessionRepository(database, vault);
  await credentials.save({
    id: 'credential-1',
    ownerType: 'user',
    ownerId: 'user-1',
    pluginId: 'demo',
    name: 'Account',
    strategy: 'bearer-token',
    secret: { token: 'credential-secret' },
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  for (const id of ['proxy-a', 'proxy-b']) {
    await networks.save({
      id,
      ownerType: 'user',
      ownerId: 'user-1',
      routeType: 'http-proxy',
      regions: [],
      tags: [],
      healthStatus: 'healthy',
      name: id,
      secretConfig: { endpoint: `http://${id}.test:8080`, password: 'route-secret' }
    });
  }
  await sessions.save({
    id: 'session-1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'credential-1',
    ownerId: 'user-1',
    networkProfileId: 'proxy-a',
    networkBinding: 'required',
    encryptedMaterial: { headers: { Authorization: 'Bearer session-secret' } },
    status: 'active',
    expiresAt: '2999-01-01T00:00:00.000Z',
    createdAt: timestamp
  });
  const row = database.connection
    .prepare('SELECT encrypted_payload FROM source_reader_credentials WHERE id=?')
    .get('credential-1') as { encrypted_payload: Uint8Array };
  assert.doesNotMatch(Buffer.from(row.encrypted_payload).toString('utf8'), /credential-secret/);
  const handle = await credentials.findHandleById('credential-1');
  assert.deepEqual(await credentials.resolveSecret(handle!), { token: 'credential-secret' });
  assert.equal(
    (
      await sessions.findActive({
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        credentialProfileId: 'credential-1',
        ownerId: 'user-1',
        networkProfileId: 'proxy-a'
      })
    )?.id,
    'session-1'
  );
  assert.equal(
    await sessions.findActive({
      pluginId: 'demo',
      pluginVersion: '2.0.0',
      credentialProfileId: 'credential-1',
      ownerId: 'user-1',
      networkProfileId: 'proxy-a'
    }),
    undefined
  );
  await assert.rejects(
    () =>
      sessions.findActive({
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        credentialProfileId: 'credential-1',
        ownerId: 'user-1',
        networkProfileId: 'proxy-b'
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SESSION_BINDING_MISMATCH'
  );
});

test('plugin and auth challenge stores preserve lifecycle state without exposing secrets', async (t) => {
  const database = migratedDatabase(t);
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 8));
  const plugins = new SqlitePluginStore(database);
  const challenges = new SqliteAuthChallengeRepository(database, vault);
  const manifest = parseSourcePluginManifest(packageManifest);

  await plugins.upsertPluginVersion({
    pluginId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    trustLevel: 'signed',
    status: 'installed',
    packagePath: 'C:/plugins/signed-demo/1.0.0',
    checksum: 'a'.repeat(64),
    signatureStatus: 'valid',
    manifestJson: JSON.stringify(manifest),
    sdkRange: manifest.engines.sourceReader,
    installedAt: timestamp,
    sandboxProtocolVersion: 1
  });
  await plugins.replaceRequestedPermissions({
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    permissions: [{ permission: 'network', scopeJson: JSON.stringify(['example.test']) }]
  });
  assert.equal(await plugins.permissionsApproved(manifest.id, manifest.version), false);
  await plugins.approvePermissions({
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    approvedBy: 'source-admin',
    approvedAt: timestamp
  });
  await plugins.activateCandidateAtomically(manifest.id, manifest.version, timestamp);
  const active = await plugins.findActive(manifest.id);
  assert.equal(active?.status, 'active');
  assert.equal(active?.manifest.id, manifest.id);

  await challenges.save({
    id: 'challenge-1',
    pluginId: manifest.id,
    ownerId: 'user-1',
    type: 'otp',
    status: 'pending',
    expiresAt: '2999-01-01T00:00:00.000Z',
    encryptedState: { otpSession: 'challenge-secret' },
    createdAt: timestamp
  });
  const row = database.connection
    .prepare('SELECT encrypted_state FROM source_reader_auth_challenges WHERE id=?')
    .get('challenge-1') as { encrypted_state: Uint8Array };
  assert.doesNotMatch(Buffer.from(row.encrypted_state).toString('utf8'), /challenge-secret/);
  const challenge = await challenges.findPendingById('challenge-1');
  assert.deepEqual(await challenges.resolveState(challenge!), {
    otpSession: 'challenge-secret'
  });
  await challenges.complete('challenge-1', timestamp);
  assert.equal(await challenges.findPendingById('challenge-1'), undefined);
});

test('health persistence keeps current thresholds and unregisters quarantined plugins', async () => {
  let failures = 4;
  let since = '';
  const recorded: Array<{ status: string; failureCode?: string }> = [];
  const quarantined: string[] = [];
  const unregistered: string[] = [];
  const adapter = new PipelinePluginHealthAdapter(
    {
      async record(input) {
        recorded.push({ status: input.status, failureCode: input.failureCode });
      },
      async recentFailures(input) {
        since = input.since;
        return failures;
      },
      async recentFailuresByCode() {
        return 5;
      }
    },
    clock,
    () => 'health-1',
    {
      plugins: {
        async quarantine(pluginId, version, reason) {
          quarantined.push(`${pluginId}@${version}:${reason}`);
        }
      },
      registry: { unregister: (pluginId) => unregistered.push(pluginId) }
    }
  );
  const candidate = {
    pluginId: 'external-demo',
    pluginVersion: '1.0.0',
    domain: 'example.test',
    normalizedUrl: 'https://example.test/book',
    priority: 1,
    trustLevel: 'external' as const,
    executionMode: 'isolated' as const,
    contractVersion: 1
  };

  assert.equal(await adapter.isEligible({ candidate, capability: 'metadata' }), true);
  assert.equal(since, '2026-07-20T23:59:00.000Z');
  failures = 5;
  assert.equal(await adapter.isEligible({ candidate, capability: 'metadata' }), false);
  await adapter.quarantineIntegrityFailure!({
    candidate,
    failureCode: 'PLUGIN_PACKAGE_INVALID'
  });
  assert.deepEqual(quarantined, ['external-demo@1.0.0:PLUGIN_PACKAGE_INVALID']);
  assert.deepEqual(unregistered, ['external-demo']);
  await adapter.recordOutputPolicyViolation({
    pluginId: 'external-demo',
    pluginVersion: '1.0.0',
    stream: 'stdout',
    bytes: 32
  });
  assert.deepEqual(recorded, [{ status: 'failed', failureCode: 'PLUGIN_OUTPUT_POLICY_VIOLATION' }]);
  assert.deepEqual(quarantined, [
    'external-demo@1.0.0:PLUGIN_PACKAGE_INVALID',
    'external-demo@1.0.0:PLUGIN_OUTPUT_POLICY_VIOLATION'
  ]);
  assert.deepEqual(unregistered, ['external-demo', 'external-demo']);
});

test('route-aware HTTP gates every outbound source request before network I/O', async () => {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    calls.push(`request:${request.method}`);
    response.end('ok');
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('gate test server did not bind');
  const signal = new AbortController().signal;
  const adapter = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(), {
    requestGate: {
      async enter(url, observedSignal) {
        assert.equal(observedSignal, signal);
        calls.push(`gate:${url}`);
      }
    }
  });
  const url = `http://127.0.0.1:${address.port}/source`;
  try {
    await adapter.get(url, { signal });
    await adapter.post(url, { signal, body: 'payload' });
    await adapter.head(url, { signal });
    assert.deepEqual(calls, [
      `gate:${url}`,
      'request:GET',
      `gate:${url}`,
      'request:POST',
      `gate:${url}`,
      'request:HEAD'
    ]);
  } finally {
    adapter.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('resolved proxy routes carry real traffic without direct fallback', async () => {
  const target = await startDestination();
  const proxy = await startHttpProxyServer();
  const adapter = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(4));
  try {
    const response = await adapter.getRouted(target.url, {
      route: { kind: 'http-proxy', identity: 'proxy-route', endpoint: proxy.url }
    });
    assert.deepEqual(JSON.parse(response.data), { proxied: 'http' });
    assert.equal(proxy.requests.length, 1);

    const before = target.requests();
    await assert.rejects(
      () =>
        adapter.getRouted(target.url, {
          route: {
            kind: 'http-proxy',
            identity: 'offline-route',
            endpoint: 'http://127.0.0.1:1',
            password: 'must-not-leak'
          },
          timeoutMs: 200
        }),
      (error: unknown) =>
        error instanceof SourceReaderError &&
        error.code === 'NETWORK_ROUTE_UNAVAILABLE' &&
        !String(error).includes('must-not-leak')
    );
    assert.equal(target.requests(), before);
  } finally {
    adapter.destroy();
    await proxy.close();
    await target.close();
  }
});

test('route-aware HTTP keeps the current response budget above ten MiB', async () => {
  const payload = Buffer.alloc(11 * 1024 * 1024, 'a');
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/plain');
    response.end(payload);
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('large response server did not bind');
  const adapter = new RouteAwareHttpClientAdapter();
  try {
    const response = await adapter.get(`http://127.0.0.1:${address.port}/large`);
    assert.equal(Buffer.byteLength(response.data), payload.byteLength);
  } finally {
    adapter.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('route-aware HTTP honors an injected response budget', async () => {
  const server = createServer((_request, response) => response.end(Buffer.alloc(2_048, 'a')));
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('bounded response server did not bind');
  const adapter = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(), {
    maxResponseBytes: 1_024
  });
  try {
    await assert.rejects(
      () => adapter.get(`http://127.0.0.1:${address.port}/large`),
      (error: unknown) =>
        error instanceof SourceReaderError && error.code === 'SOURCE_RESPONSE_TOO_LARGE'
    );
  } finally {
    adapter.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('route-aware HTTP honors an injected request timeout', async () => {
  const server = createServer((_request, response) => {
    setTimeout(() => response.end('late'), 100);
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('slow response server did not bind');
  const adapter = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(), {
    requestTimeoutMs: 20
  });
  try {
    await assert.rejects(
      () => adapter.get(`http://127.0.0.1:${address.port}/slow`),
      (error: unknown) =>
        error instanceof SourceReaderError && error.code === 'SOURCE_REQUEST_TIMEOUT'
    );
  } finally {
    adapter.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('route-aware HTTP maps direct upstream rate limits to a typed source error', async () => {
  const server = createServer((_request, response) => {
    response.statusCode = 429;
    response.setHeader('retry-after', '30');
    response.end('rate limited');
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('rate-limit server did not bind');
  const adapter = new RouteAwareHttpClientAdapter();
  try {
    await assert.rejects(
      () => adapter.get(`http://127.0.0.1:${address.port}/limited`),
      (error: unknown) =>
        error instanceof SourceReaderError &&
        error.code === 'SOURCE_RATE_LIMITED' &&
        error.retryable === true &&
        error.details?.status === 429
    );
  } finally {
    adapter.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('route-aware HTTP never leaks an untyped direct HTTP status error', async () => {
  const server = createServer((_request, response) => {
    response.statusCode = 404;
    response.end('missing');
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('missing-source server did not bind');
  const adapter = new RouteAwareHttpClientAdapter();
  try {
    await assert.rejects(
      () => adapter.get(`http://127.0.0.1:${address.port}/missing`),
      (error: unknown) =>
        error instanceof SourceReaderError &&
        error.code === 'SOURCE_TEMPORARILY_UNAVAILABLE' &&
        error.retryable === false &&
        error.details?.status === 404
    );
  } finally {
    adapter.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('NovelCool runs through the new pipeline with account-scoped persistent cache', async (t) => {
  const database = migratedDatabase(t);
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 9));
  const credentials = new SqliteCredentialRepository(database, vault);
  const networks = new SqliteNetworkProfileRepository(database, vault);
  const sessions = new SqliteSessionRepository(database, vault);
  for (const id of ['credential-a', 'credential-b']) {
    await credentials.save({
      id,
      ownerType: 'user',
      ownerId: 'user-1',
      pluginId: 'novelcool',
      name: id,
      strategy: 'cookie-import',
      secret: { cookie: id },
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  const html = await readFile('tests/fixtures/source-reader/novelcool-novel.html', 'utf8');
  let httpCalls = 0;
  const http = {
    async get(url: string) {
      httpCalls += 1;
      return { url, status: 200, headers: {}, data: html };
    },
    async post(url: string) {
      return this.get(url);
    },
    async head(url: string) {
      return { url, status: 200, headers: {}, data: '' };
    }
  };
  const logger = { info() {}, warn() {}, error() {} };
  const registry = new InMemoryPluginRegistry();
  registry.register(novelCoolPlugin);
  const external = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 20
  });
  const runtime = new RuntimeRouter(new InProcessPluginRuntime(), external, 10_000);
  const contextFactory = new PluginContextFactory(
    http,
    new CheerioHtmlParserAdapter(),
    clock,
    logger,
    sessions
  );
  const contextResolver = new RuntimeContextResolverService(
    credentials,
    networks,
    sessions,
    new NetworkRouteResolver(networks)
  );
  const cache = new SqliteReaderCache(database);
  const health = new PipelinePluginHealthAdapter(
    new SqlitePluginHealthRepository(database),
    clock,
    () => randomUUID()
  );
  const facade = new SourceReaderFacade({
    requestGate: { assertAllowed: async () => undefined },
    candidates: new CandidateResolver(new PipelinePluginRegistryAdapter(registry)),
    contexts: new PipelineRuntimeContextAdapter(contextResolver),
    cache: new ReaderCachePolicy(cache, clock),
    invocation: new InvocationCoordinator(
      new PipelineSourceReaderInvocationAdapter({
        registry,
        runtime,
        contextFactory
      })
    ),
    pagination: new PaginationCoordinator(new HmacCursorCodec(Buffer.alloc(32, 3), clock), clock),
    health: new HealthFallbackPolicy(health, clock),
    validator: new SourceResultValidator()
  });
  const request = {
    url: 'https://www.novelcool.com/novel/fixture.html',
    userId: 'user-1',
    credentialProfileId: 'credential-a'
  };
  const first = await facade.readMetadata(request);
  const cached = await facade.readMetadata(request);
  assert.equal(first.data.title, 'Fixture Novel');
  assert.deepEqual(cached, first);
  assert.equal(httpCalls, 1);
  const row = database.connection
    .prepare(
      `SELECT scope, scope_identity_hash, network_identity_hash, request_fingerprint
       FROM source_reader_cache_entries`
    )
    .get() as {
    scope: string;
    scope_identity_hash: string;
    network_identity_hash: string;
    request_fingerprint: string;
  };
  assert.equal(row.scope, 'account');
  assert.equal(row.scope_identity_hash, sha256('credential-a'));
  assert.equal(row.network_identity_hash, sha256('direct'));
  assert.equal(
    row.request_fingerprint,
    sha256(
      JSON.stringify({
        normalizedUrl: 'https://novelcool.com/novel/fixture.html',
        requestParameters: {}
      })
    )
  );
  const tags = database.connection
    .prepare('SELECT tag FROM source_reader_cache_tags ORDER BY tag')
    .all()
    .map((item) => (item as { tag: string }).tag);
  assert.ok(tags.includes('plugin:novelcool'));
  assert.ok(tags.includes('credential:credential-a'));
  assert.ok(tags.includes('user:user-1'));
  const healthRow = database.connection
    .prepare(
      `SELECT plugin_id, capability, status
       FROM source_reader_health_checks ORDER BY checked_at DESC LIMIT 1`
    )
    .get() as { plugin_id: string; capability: string; status: string };
  assert.equal(healthRow.plugin_id, 'novelcool');
  assert.equal(healthRow.capability, 'metadata');
  assert.equal(healthRow.status, 'healthy');

  await cache.invalidate(['credential:credential-a']);
  await facade.readMetadata(request);
  assert.equal(httpCalls, 2);
  await facade.readMetadata({ ...request, credentialProfileId: 'credential-b' });
  assert.equal(httpCalls, 3);
});
