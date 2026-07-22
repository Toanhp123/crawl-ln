import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ExternalPluginRegistrationFactory } from '../../apps/api-legacy/src/modules/source-reader/application/services/external-plugin-registration.factory.ts';
import { PluginActivationService } from '../../apps/api-legacy/src/modules/source-reader/application/services/plugin-activation.service.ts';
import type { ExternalPluginRequest } from '../../apps/api-legacy/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts';
import type { StoredPluginVersion } from '../../apps/api-legacy/src/modules/source-reader/application/ports/plugin-store.port.ts';
import { ExternalPluginLoader } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts';
import { InMemoryPluginRegistry } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';

const manifest = {
  id: 'registration-parity-demo',
  name: 'Registration Parity Demo',
  version: '1.0.0',
  engines: { sourceReader: '^2.9.6' },
  capabilities: ['authentication'] as const,
  contracts: { authentication: 1 },
  matchers: [{ hosts: ['example.test'], capabilities: ['authentication'] as const, priority: 10 }],
  runtime: { preferredMode: 'isolated' as const },
  permissions: { network: { hosts: ['example.test'] }, authentication: true },
  authentication: { custom: { fields: ['username', 'password'] } }
};

async function createPackage(t: test.TestContext): Promise<StoredPluginVersion> {
  const root = await mkdtemp(join(tmpdir(), 'source-reader-registration-parity-'));
  const packagePath = join(root, manifest.id, manifest.version);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const entryBytes = Buffer.from('export default {};');
  await mkdir(join(packagePath, 'dist'), { recursive: true });
  await writeFile(join(packagePath, 'manifest.json'), manifestBytes);
  await writeFile(join(packagePath, 'dist/index.js'), entryBytes);
  await writeFile(
    join(packagePath, 'checksums.json'),
    JSON.stringify({
      'manifest.json': createHash('sha256').update(manifestBytes).digest('hex'),
      'dist/index.js': createHash('sha256').update(entryBytes).digest('hex')
    })
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    pluginId: manifest.id,
    version: manifest.version,
    trustLevel: 'local-unverified',
    status: 'installed',
    packagePath,
    checksum: 'checksum',
    signatureStatus: 'unsigned',
    manifest
  };
}

test('activation and startup loader publish the same external plugin proxies', async (t) => {
  const stored = await createPackage(t);
  const requests: ExternalPluginRequest[] = [];
  const handle = {
    pluginId: stored.pluginId,
    pluginVersion: stored.version,
    async request(request: ExternalPluginRequest) {
      requests.push(request);
      if (request.operation === 'healthCheck') return { status: 'healthy' };
      if (request.operation === 'probeCanHandle') return true;
      if (request.operation === 'login' || request.operation === 'resumeChallenge') {
        return {
          status: 'authenticated',
          session: { kind: 'headers', headers: { 'x-session': 'ok' }, networkBinding: 'required' }
        };
      }
      return undefined;
    },
    async terminate() {}
  };
  const supervisor = {
    async start() {
      return handle;
    },
    get() {
      return handle;
    },
    async stop() {}
  };
  let id = 0;
  const factory = new ExternalPluginRegistrationFactory({
    supervisor,
    timeoutMs: 5_000,
    now: () => new Date('2026-07-20T00:00:00.000Z'),
    randomId: () => `rpc-${++id}`,
    protocolVersion: 1
  });
  const store = {
    findVersion: async () => stored,
    findActive: async () => undefined,
    permissionsApproved: async () => true,
    activateCandidateAtomically: async () => undefined,
    restoreActivation: async () => undefined,
    recordActivationFailure: async () => undefined,
    listActive: async () => [{ ...stored, status: 'active' as const }]
  };
  const registry = new InMemoryPluginRegistry();
  const activation = new PluginActivationService(
    store as never,
    registry,
    supervisor,
    factory,
    { now: () => new Date('2026-07-20T00:00:00.000Z') },
    { randomId: () => `activation-${++id}` },
    5_000
  );

  await activation.activate({
    pluginId: stored.pluginId,
    version: stored.version,
    signal: new AbortController().signal
  });
  const activated = registry.findById(stored.pluginId);
  assert.ok(activated);

  const [loaded] = await new ExternalPluginLoader(store as never, factory).loadActive();
  assert.ok(loaded);

  for (const registration of [activated, loaded]) {
    assert.equal(typeof registration.plugin.lifecycle?.healthCheck, 'function');
    assert.equal(typeof registration.plugin.canHandle, 'function');
    assert.equal(typeof registration.plugin.authentication?.login, 'function');
    assert.equal(typeof registration.plugin.authentication?.resumeChallenge, 'function');
  }

  requests.length = 0;
  await activated.plugin.canHandle?.(
    {
      url: 'https://example.test/book',
      normalizedUrl: 'https://example.test/book',
      domain: 'example.test',
      capability: 'authentication'
    },
    {} as never
  );
  await activated.plugin.authentication?.login?.(
    { fields: { username: 'alice', password: 'secret' }, routeIdentity: 'proxy-a' },
    {} as never
  );
  await activated.plugin.authentication?.resumeChallenge?.(
    {
      challengeId: 'challenge-1',
      challengeType: 'otp',
      response: { otp: '123456' },
      opaqueState: { step: 'otp' },
      routeIdentity: 'proxy-a'
    },
    {} as never
  );

  assert.deepEqual(
    requests.slice(-3).map((request) => request.operation),
    ['probeCanHandle', 'login', 'resumeChallenge']
  );
  assert.deepEqual(requests.at(-2)?.payload, {
    strategy: 'custom',
    fields: { username: 'alice', password: 'secret' },
    routeIdentity: 'proxy-a'
  });
});
