import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AuthenticationOrchestratorService } from '../../apps/api/src/modules/source-reader/application/services/authentication-orchestrator.service.ts';
import { StandardAuthenticationService } from '../../apps/api/src/modules/source-reader/application/services/standard-authentication.service.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SqliteCredentialRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';
import { SqliteSessionRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-reader-login-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const vault = new LocalEncryptedVault(Buffer.alloc(32, 7));
const credentials = new SqliteCredentialRepository(database, vault);
const sessions = new SqliteSessionRepository(database, vault);
const now = new Date('2026-07-20T00:00:00.000Z');

await credentials.save({
  id: 'cred-1',
  ownerType: 'user',
  ownerId: 'user-1',
  pluginId: 'demo',
  domain: 'example.test',
  strategy: 'bearer-token',
  name: 'Demo account',
  secret: { token: 'secret-token' },
  enabled: true,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

const orchestrator = new AuthenticationOrchestratorService(
  credentials,
  sessions,
  new StandardAuthenticationService(),
  {
    get: async (url: string) => ({ url, status: 200, headers: {}, data: 'ok' }),
    post: async (url: string) => ({ url, status: 200, headers: {}, data: 'ok' })
  },
  { randomId: () => 'session-1' },
  { now: () => now }
);

test.after(async () => {
  database.close();
  await rm(root, { recursive: true, force: true });
});

test('login resolves credential secret internally and persists encrypted session', async () => {
  const result = await orchestrator.login({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    userId: 'user-1',
    credentialProfileId: 'cred-1',
    strategy: 'bearer-token',
    configuration: {}
  });
  assert.equal(result.status, 'authenticated');

  const session = await sessions.findActive({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'cred-1',
    ownerId: 'user-1'
  });
  assert.ok(session);
  assert.deepEqual(await sessions.resolveMaterial(session), {
    kind: 'headers',
    headers: { Authorization: 'Bearer secret-token' },
    networkBinding: 'none'
  });

  const row = database.connection
    .prepare('SELECT encrypted_session FROM source_reader_sessions WHERE id=?')
    .get('session-1') as { encrypted_session: Uint8Array };
  assert.equal(Buffer.from(row.encrypted_session).includes(Buffer.from('secret-token')), false);
});

test('plugin context attaches decrypted session headers only inside host HTTP calls', async () => {
  const session = await sessions.findActive({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'cred-1',
    ownerId: 'user-1'
  });
  assert.ok(session);
  let headers: Record<string, string> | undefined;
  const factory = new PluginContextFactory(
    {
      get: async (url, options) => {
        headers = options?.headers;
        return { url, status: 200, headers: {}, data: 'ok' };
      },
      post: async () => ({ url: '', status: 200, headers: {}, data: '' }),
      head: async () => ({ url: '', status: 200, headers: {}, data: '' })
    },
    { load: () => ({}) } as never,
    { now: () => now },
    { info() {}, warn() {}, error() {} },
    sessions
  );
  const context = factory.create({
    pluginId: 'demo',
    allowedHosts: ['example.test'],
    signal: new AbortController().signal,
    runtimeContext: {
      session,
      executionMode: 'in-process',
      browserRequired: false,
      cacheIdentity: {
        public: 'public',
        account: 'cred-1',
        user: 'user-1',
        session: 'session-1',
        network: 'direct'
      }
    }
  });

  await context.http.get('https://example.test/chapter/1');
  assert.deepEqual(headers, { Authorization: 'Bearer secret-token' });
  assert.equal('session' in context, false);
});

test('logout revokes all sessions for the credential', async () => {
  await orchestrator.logout({ credentialProfileId: 'cred-1' });
  assert.equal(
    await sessions.findActive({
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      credentialProfileId: 'cred-1',
      ownerId: 'user-1'
    }),
    undefined
  );
});
