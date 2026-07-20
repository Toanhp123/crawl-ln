import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SqliteCredentialRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';
import { SqliteNetworkProfileRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts';
import { SqliteSessionRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { browserSessionIdentityKey } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'source-reader-session-binding-'));
  const database = createSqliteDatabase(join(root, 'test.sqlite'));
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 5));
  const credentials = new SqliteCredentialRepository(database, vault);
  const networks = new SqliteNetworkProfileRepository(database, vault);
  const sessions = new SqliteSessionRepository(database, vault);
  t.after(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });

  await credentials.save({
    id: 'credential-1',
    ownerType: 'user',
    ownerId: 'user-1',
    pluginId: 'demo',
    name: 'Account',
    strategy: 'bearer-token',
    secret: { token: 'secret' },
    enabled: true,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z'
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
      secretConfig: { url: `http://${id}.test:8080` }
    });
  }
  await sessions.save({
    id: 'session-v1-proxy-a',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'credential-1',
    ownerId: 'user-1',
    networkProfileId: 'proxy-a',
    networkBinding: 'required',
    encryptedMaterial: { cookie: 'session-secret' },
    status: 'active',
    expiresAt: '2999-01-01T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z'
  });
  return { sessions };
}

test('active session lookup requires the exact plugin version', async (t) => {
  const { sessions } = await fixture(t);
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
    'session-v1-proxy-a'
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
});

test('required route-bound session rejects direct or another proxy profile', async (t) => {
  const { sessions } = await fixture(t);
  for (const networkProfileId of [undefined, 'proxy-b']) {
    await assert.rejects(
      () =>
        sessions.findActive({
          pluginId: 'demo',
          pluginVersion: '1.0.0',
          credentialProfileId: 'credential-1',
          ownerId: 'user-1',
          ...(networkProfileId ? { networkProfileId } : {})
        }),
      (error: unknown) =>
        error instanceof SourceReaderError && error.code === 'SESSION_BINDING_MISMATCH'
    );
  }
});

test('optional route-bound session is never reused through a different route', async (t) => {
  const { sessions } = await fixture(t);
  await sessions.save({
    id: 'session-optional-proxy-a',
    pluginId: 'demo',
    pluginVersion: '1.1.0',
    credentialProfileId: 'credential-1',
    ownerId: 'user-1',
    networkProfileId: 'proxy-a',
    networkBinding: 'optional',
    encryptedMaterial: { cookie: 'optional-session-secret' },
    status: 'active',
    expiresAt: '2999-01-01T00:00:00.000Z',
    createdAt: '2026-07-20T00:01:00.000Z'
  });

  assert.equal(
    (
      await sessions.findActive({
        pluginId: 'demo',
        pluginVersion: '1.1.0',
        credentialProfileId: 'credential-1',
        ownerId: 'user-1',
        networkProfileId: 'proxy-a'
      })
    )?.id,
    'session-optional-proxy-a'
  );

  for (const networkProfileId of [undefined, 'proxy-b']) {
    assert.equal(
      await sessions.findActive({
        pluginId: 'demo',
        pluginVersion: '1.1.0',
        credentialProfileId: 'credential-1',
        ownerId: 'user-1',
        ...(networkProfileId ? { networkProfileId } : {})
      }),
      undefined
    );
  }
});

test('browser pool identity binds plugin version, account, session, owner, and route identity', () => {
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
});
