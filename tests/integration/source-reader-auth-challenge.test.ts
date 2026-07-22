import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AuthChallengeService } from '../../apps/api-legacy/src/modules/source-reader/application/services/auth-challenge.service.ts';
import { AuthenticationOrchestratorService } from '../../apps/api-legacy/src/modules/source-reader/application/services/authentication-orchestrator.service.ts';
import { InMemoryPluginRegistry } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { LocalEncryptedVault } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SqliteAuthChallengeRepository } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/sqlite/sqlite-auth-challenge.repository.ts';
import { SqliteCredentialRepository } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';
import { SqliteNetworkProfileRepository } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts';
import { SqliteSessionRepository } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { createSqliteDatabase } from '../../apps/api-legacy/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-challenge-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const vault = new LocalEncryptedVault(Buffer.alloc(32, 9));
const repository = new SqliteAuthChallengeRepository(database, vault);
const credentials = new SqliteCredentialRepository(database, vault);
const networks = new SqliteNetworkProfileRepository(database, vault);
const sessions = new SqliteSessionRepository(database, vault);
const registry = new InMemoryPluginRegistry();
const closedBrowserIdentities: string[] = [];
let now = new Date('2026-07-19T00:00:00.000Z');
let sequence = 0;

registry.register(
  {
    manifest: {
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      engines: { sourceReader: '>=1.0.0 <2.0.0' },
      capabilities: ['authentication'],
      contracts: {},
      matchers: [{ hosts: ['example.test'], priority: 10 }],
      runtime: { preferredMode: 'in-process' },
      permissions: { network: { hosts: ['example.test'] }, authentication: true }
    },
    authentication: {
      async login() {
        throw new Error('not used');
      },
      async resumeChallenge(request) {
        assert.equal(request.response.flowToken, 'opaque');
        assert.equal(request.response.code, '123456');
        return {
          status: 'authenticated',
          session: {
            kind: 'cookies',
            cookies: [{ name: 'sid', value: 'abc' }],
            networkBinding: 'required'
          }
        };
      }
    }
  },
  { trustLevel: 'built-in', executionMode: 'in-process' }
);

await credentials.save({
  id: 'cred-1',
  ownerType: 'user',
  ownerId: 'u1',
  pluginId: 'demo',
  domain: 'example.test',
  strategy: 'custom',
  name: 'Demo credential',
  secret: { token: 'opaque' },
  enabled: true,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});
await networks.save({
  id: 'route-1',
  ownerType: 'user',
  ownerId: 'u1',
  routeType: 'direct',
  regions: [],
  tags: [],
  healthStatus: 'healthy',
  name: 'Direct route',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

const service = new AuthChallengeService(
  repository,
  {
    open: async () => {
      throw new Error('not used');
    },
    closeByIdentity: async (identity) => {
      closedBrowserIdentities.push(
        `${identity.userId}:${identity.pluginId}:${identity.sourceAccountId}:${identity.networkRouteId}`
      );
    }
  },
  registry,
  sessions,
  {
    create: () => ({
      http: { get: async () => ({ url: '', status: 200, headers: {}, data: '' }) },
      html: { load: () => ({}) },
      url: { normalize: (value: string) => value, resolve: (value: string) => value },
      cache: { get: async () => undefined, set: async () => undefined },
      logger: { info() {}, warn() {} },
      clock: { now: () => now.toISOString() },
      signal: new AbortController().signal
    })
  } as never,
  { randomId: () => `challenge-${++sequence}` },
  { now: () => now }
);

test.after(async () => {
  database.close();
  await rm(root, { recursive: true, force: true });
});

test('OTP challenge can resume the same plugin auth flow exactly once', async () => {
  const challenge = await service.create({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'cred-1',
    networkProfileId: 'route-1',
    ownerId: 'u1',
    type: 'otp',
    expiresAt: '2026-07-19T00:05:00.000Z',
    state: { flowToken: 'opaque' }
  });
  const result = await service.respond({
    challengeId: challenge.id,
    ownerId: 'u1',
    response: { type: 'otp', code: '123456' }
  });
  assert.equal(result.status, 'authenticated');
  assert.ok(
    await sessions.findActive({
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      credentialProfileId: 'cred-1',
      ownerId: 'u1',
      networkProfileId: 'route-1'
    })
  );
  await assert.rejects(
    () =>
      service.respond({
        challengeId: challenge.id,
        ownerId: 'u1',
        response: { type: 'otp', code: '123456' }
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'AUTH_CHALLENGE_EXPIRED'
  );
});

test('authentication orchestrator persists plugin challenges and returns the opaque challenge id', async () => {
  const created: Array<Record<string, unknown>> = [];
  const orchestrator = new AuthenticationOrchestratorService(
    {
      findHandleById: async () => undefined,
      findCandidates: async () => [],
      resolveSecret: async () => ({}),
      save: async () => undefined,
      delete: async () => undefined
    },
    { save: async () => undefined } as never,
    {
      authenticate: async () => ({
        status: 'challenge-required',
        challenge: {
          id: 'plugin-challenge',
          type: 'otp',
          expiresAt: '2026-07-19T00:05:00.000Z'
        }
      })
    } as never,
    {
      get: async (url: string) => ({ url, status: 200, headers: {}, data: '' }),
      post: async (url: string) => ({ url, status: 200, headers: {}, data: '' })
    },
    { randomId: () => 'session-unused' },
    { now: () => now },
    undefined,
    undefined,
    {
      create: async (input: Record<string, unknown>) => {
        created.push(input);
        return {
          id: 'persisted-challenge',
          pluginId: 'demo',
          credentialProfileId: 'cred-1',
          ownerId: 'u1',
          type: 'otp' as const,
          status: 'pending' as const,
          expiresAt: '2026-07-19T00:05:00.000Z'
        };
      }
    }
  );

  const result = await orchestrator.authenticate({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    userId: 'u1',
    credential: {
      id: 'cred-1',
      ownerType: 'user',
      ownerId: 'u1',
      pluginId: 'demo',
      strategy: 'bearer-token'
    },
    strategy: 'bearer-token',
    configuration: {}
  });

  assert.equal(result.status, 'challenge-required');
  if (result.status !== 'challenge-required') return;
  assert.equal(result.challenge.id, 'persisted-challenge');
  assert.deepEqual(created, [
    {
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      credentialProfileId: 'cred-1',
      ownerId: 'u1',
      type: 'otp',
      expiresAt: '2026-07-19T00:05:00.000Z',
      state: {
        pluginChallengeId: 'plugin-challenge',
        opaqueState: {},
        __routeIdentity: 'direct'
      }
    }
  ]);
});

test('challenge response is rejected when the active plugin version changed', async () => {
  now = new Date('2026-07-19T00:00:00.000Z');
  const challenge = await service.create({
    pluginId: 'demo',
    pluginVersion: '2.0.0',
    credentialProfileId: 'cred-1',
    networkProfileId: 'route-1',
    ownerId: 'u1',
    type: 'otp',
    expiresAt: '2026-07-19T00:05:00.000Z',
    state: { flowToken: 'opaque', __routeIdentity: 'route-1' }
  });

  await assert.rejects(
    () =>
      service.respond({
        challengeId: challenge.id,
        ownerId: 'u1',
        response: { type: 'otp', code: '123456' }
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SESSION_BINDING_MISMATCH'
  );
});

test('challenge response is rejected when the network route identity changed', async () => {
  now = new Date('2026-07-19T00:00:00.000Z');
  const challenge = await service.create({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'cred-1',
    networkProfileId: 'route-1',
    ownerId: 'u1',
    type: 'otp',
    expiresAt: '2026-07-19T00:05:00.000Z',
    state: { flowToken: 'opaque', __routeIdentity: 'route-before-change' }
  });

  await assert.rejects(
    () =>
      service.respond({
        challengeId: challenge.id,
        ownerId: 'u1',
        response: { type: 'otp', code: '123456' }
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SESSION_BINDING_MISMATCH'
  );
});

test('expired browser challenge closes its browser identity', async () => {
  await service.create({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'cred-1',
    networkProfileId: 'route-1',
    ownerId: 'u1',
    type: 'browser-interaction',
    expiresAt: '2026-07-19T00:05:00.000Z',
    state: { flowToken: 'browser-flow' }
  });
  now = new Date('2026-07-19T00:10:00.000Z');
  await service.expirePending();
  assert.deepEqual(closedBrowserIdentities, ['u1:demo:cred-1:route-1']);
});
