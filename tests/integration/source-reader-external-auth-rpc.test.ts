import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AuthenticationOrchestratorService } from '../../apps/api-legacy/src/modules/source-reader/application/services/authentication-orchestrator.service.ts';
import { StandardAuthenticationService } from '../../apps/api-legacy/src/modules/source-reader/application/services/standard-authentication.service.ts';
import { ExternalPluginRegistrationFactory } from '../../apps/api-legacy/src/modules/source-reader/application/services/external-plugin-registration.factory.ts';
import type { ExternalPluginRequest } from '../../apps/api-legacy/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts';
import type { StoredPluginVersion } from '../../apps/api-legacy/src/modules/source-reader/application/ports/plugin-store.port.ts';
import { ExternalPluginLoader } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts';
import { InMemoryPluginRegistry } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-external-auth-rpc-'));
const packagePath = join(root, 'demo', '1.0.0');
const manifest = {
  id: 'external-auth-demo',
  name: 'External Auth Demo',
  version: '1.0.0',
  engines: { sourceReader: '^2.9.6' },
  capabilities: ['authentication'] as const,
  contracts: { authentication: 1 },
  matchers: [{ hosts: ['example.test'], capabilities: ['authentication'] as const, priority: 10 }],
  runtime: { preferredMode: 'isolated' as const },
  permissions: {
    network: { hosts: ['example.test'] },
    authentication: true
  },
  authentication: {
    custom: { fields: ['username', 'password'] }
  }
};

const requests: Array<{ request: ExternalPluginRequest; host: unknown }> = [];
const handle = {
  pluginId: manifest.id,
  pluginVersion: manifest.version,
  async request(request: ExternalPluginRequest, _signal: AbortSignal, host?: unknown) {
    requests.push({ request, host });
    if (request.operation === 'probeCanHandle') return true;
    return {
      status: 'authenticated',
      session: {
        kind: 'headers',
        headers: { 'x-session': 'ok' },
        networkBinding: 'required'
      }
    };
  },
  async terminate() {}
};

const stored: StoredPluginVersion = {
  pluginId: manifest.id,
  version: manifest.version,
  trustLevel: 'local-unverified',
  status: 'active',
  packagePath,
  checksum: 'checksum',
  signatureStatus: 'unsigned',
  manifest
};

test.before(async () => {
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
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
});

test('external probe, login, and challenge use dedicated bounded RPC DTOs', async () => {
  requests.length = 0;
  const registrationFactory = new ExternalPluginRegistrationFactory({
    supervisor: {
      start: async () => handle,
      get: () => handle,
      stop: async () => undefined
    },
    timeoutMs: 5_000,
    now: () => new Date('2026-07-20T00:00:00.000Z'),
    randomId: () => `rpc-${requests.length + 1}`,
    protocolVersion: 1
  });
  const loader = new ExternalPluginLoader(
    { listActive: async () => [stored] } as never,
    registrationFactory
  );
  const [registration] = await loader.loadActive();
  assert.ok(registration);

  const accepted = await registration.plugin.canHandle?.(
    {
      url: 'https://example.test/book',
      normalizedUrl: 'https://example.test/book',
      domain: 'example.test',
      capability: 'authentication'
    },
    {
      repository: 'must-not-cross',
      vault: 'must-not-cross',
      actor: { roles: ['admin'] }
    } as never
  );
  assert.equal(accepted, true);
  assert.equal(requests[0]?.request.operation, 'probeCanHandle');
  assert.deepEqual(requests[0]?.request.payload, {
    normalizedUrl: 'https://example.test/book',
    domain: 'example.test',
    capability: 'authentication'
  });
  assert.equal(requests[0]?.host, undefined);

  const registry = new InMemoryPluginRegistry();
  registry.replaceExternal([registration]);
  const savedSessions: unknown[] = [];
  const orchestrator = new AuthenticationOrchestratorService(
    {
      findHandleById: async () => undefined,
      resolveSecret: async () => ({
        username: 'alice',
        password: 'secret',
        adminToken: 'must-not-cross'
      })
    } as never,
    { save: async (value: unknown) => void savedSessions.push(value) } as never,
    new StandardAuthenticationService(),
    {
      get: async () => ({ url: '', status: 200, headers: {}, data: '' }),
      post: async () => ({ url: '', status: 200, headers: {}, data: '' })
    },
    { randomId: () => 'session-1' },
    { now: () => new Date('2026-07-20T00:00:00.000Z') },
    registry,
    {
      create: () => {
        throw new Error('full PluginContext must not be created for external auth');
      }
    } as never
  );

  await orchestrator.authenticate({
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    userId: 'user-1',
    credential: {
      id: 'credential-1',
      ownerType: 'user',
      ownerId: 'user-1',
      pluginId: manifest.id,
      domain: 'example.test',
      strategy: 'custom'
    },
    strategy: 'custom',
    configuration: { sourceUrl: 'https://example.test/login' }
  });

  const login = requests.find((item) => item.request.operation === 'login');
  assert.deepEqual(login?.request.payload, {
    strategy: 'custom',
    fields: { username: 'alice', password: 'secret' },
    routeIdentity: 'direct'
  });
  assert.equal(login?.host, undefined);
  assert.equal(JSON.stringify(login?.request.payload).includes('adminToken'), false);

  await registration.plugin.authentication?.resumeChallenge?.(
    {
      challengeId: 'challenge-1',
      challengeType: 'otp',
      response: { otp: '123456' },
      opaqueState: { step: 'otp' },
      routeIdentity: 'direct'
    },
    {} as never
  );
  const resume = requests.find((item) => item.request.operation === 'resumeChallenge');
  assert.deepEqual(resume?.request.payload, {
    challengeType: 'otp',
    response: { otp: '123456' },
    opaqueState: { step: 'otp' },
    routeIdentity: 'direct'
  });
  assert.equal(resume?.host, undefined);
});
