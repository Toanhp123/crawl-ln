import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SqliteCredentialRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';
import { SqliteNetworkProfileRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts';
import { SqliteSessionRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts';
import { SqliteAuthChallengeRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-auth-challenge.repository.ts';

async function createFixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'source-reader-security-repo-'));
  const database = createSqliteDatabase(join(root, 'test.sqlite'));
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 1));
  t.after(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    database,
    credentials: new SqliteCredentialRepository(database, vault),
    networkProfiles: new SqliteNetworkProfileRepository(database, vault),
    sessions: new SqliteSessionRepository(database, vault),
    challenges: new SqliteAuthChallengeRepository(database, vault)
  };
}

const timestamp = '2026-07-19T00:00:00.000Z';

test('credential repository stores ciphertext and resolves secret only through a handle', async (t) => {
  const fixture = await createFixture(t);
  await fixture.credentials.save({
    id: 'cred-1',
    ownerType: 'user',
    ownerId: 'user-1',
    pluginId: 'demo',
    name: 'Premium',
    strategy: 'form-login',
    secret: { username: 'reader', password: 'secret' },
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  const row = fixture.database.connection
    .prepare('SELECT encrypted_payload FROM source_reader_credentials WHERE id=?')
    .get('cred-1') as { encrypted_payload: Uint8Array };
  assert.doesNotMatch(Buffer.from(row.encrypted_payload).toString('utf8'), /secret/);
  const handle = await fixture.credentials.findHandleById('cred-1');
  assert.equal(handle?.id, 'cred-1');
  assert.equal('secret' in (handle as object), false);
  assert.deepEqual(await fixture.credentials.resolveSecret(handle!), {
    username: 'reader',
    password: 'secret'
  });
});

test('network profiles preserve owner precedence, filters, health, and encrypted config', async (t) => {
  const fixture = await createFixture(t);
  await fixture.networkProfiles.save({
    id: 'system-us',
    ownerType: 'system',
    routeType: 'http-proxy',
    regions: ['US'],
    tags: ['premium'],
    healthStatus: 'healthy',
    name: 'System US',
    secretConfig: { password: 'system-secret' }
  });
  await fixture.networkProfiles.save({
    id: 'user-us',
    ownerType: 'user',
    ownerId: 'u1',
    routeType: 'vpn-gateway',
    regions: ['US', 'CA'],
    tags: ['premium', 'fast'],
    healthStatus: 'degraded',
    name: 'User US',
    secretConfig: { token: 'user-secret' }
  });
  await fixture.networkProfiles.save({
    id: 'offline-us',
    ownerType: 'system',
    routeType: 'socks-proxy',
    regions: ['US'],
    tags: ['premium'],
    healthStatus: 'offline',
    name: 'Offline US'
  });

  const candidates = await fixture.networkProfiles.findCandidates({
    userId: 'u1',
    regions: ['US'],
    tags: ['premium']
  });
  assert.deepEqual(
    candidates.map((item) => item.id),
    ['user-us', 'system-us']
  );
  assert.equal('secretConfig' in candidates[0], false);
  assert.deepEqual(await fixture.networkProfiles.resolveConfig(candidates[0]), {
    token: 'user-secret'
  });
});

test('sessions and challenges enforce binding, expiry, and credential revocation', async (t) => {
  const fixture = await createFixture(t);
  await fixture.credentials.save({
    id: 'credential-u1',
    ownerType: 'user',
    ownerId: 'u1',
    pluginId: 'demo',
    name: 'User credential',
    strategy: 'form-login',
    secret: { password: 'secret' },
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  await fixture.networkProfiles.save({
    id: 'user-us',
    ownerType: 'user',
    ownerId: 'u1',
    routeType: 'vpn-gateway',
    regions: ['US'],
    tags: [],
    healthStatus: 'healthy',
    name: 'User US'
  });
  await fixture.networkProfiles.save({
    id: 'system-us',
    ownerType: 'system',
    routeType: 'direct',
    regions: ['US'],
    tags: [],
    healthStatus: 'healthy',
    name: 'System US'
  });

  await fixture.sessions.save({
    id: 'session-1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'credential-u1',
    ownerId: 'u1',
    networkProfileId: 'user-us',
    networkBinding: 'required',
    expiresAt: '2999-01-01T00:00:00.000Z',
    encryptedMaterial: { cookie: 'session-secret' },
    status: 'active',
    createdAt: timestamp
  });

  const active = await fixture.sessions.findActive({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    credentialProfileId: 'credential-u1',
    ownerId: 'u1',
    networkProfileId: 'user-us'
  });
  assert.equal(active?.id, 'session-1');
  assert.deepEqual(await fixture.sessions.resolveMaterial(active!), {
    cookie: 'session-secret'
  });
  await assert.rejects(
    () =>
      fixture.sessions.findActive({
        pluginId: 'demo',
        pluginVersion: '1.0.0',
        credentialProfileId: 'credential-u1',
        ownerId: 'u1',
        networkProfileId: 'system-us'
      }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SESSION_BINDING_MISMATCH'
  );

  await fixture.challenges.save({
    id: 'expired-challenge',
    pluginId: 'demo',
    type: 'otp',
    status: 'pending',
    expiresAt: '2000-01-01T00:00:00.000Z',
    encryptedState: { otpSession: 'secret' },
    credentialProfileId: 'credential-u1',
    ownerId: 'u1',
    createdAt: timestamp
  });
  assert.equal(
    (await fixture.challenges.findPendingById('expired-challenge'))?.id,
    'expired-challenge'
  );
  assert.deepEqual(
    (await fixture.challenges.listExpiredPending(timestamp)).map((challenge) => challenge.id),
    ['expired-challenge']
  );
  await fixture.challenges.markExpired('expired-challenge');
  assert.equal(await fixture.challenges.findPendingById('expired-challenge'), undefined);

  await fixture.credentials.delete('credential-u1');
  assert.equal(
    await fixture.sessions.findActive({
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      credentialProfileId: 'credential-u1',
      ownerId: 'u1',
      networkProfileId: 'user-us'
    }),
    undefined
  );
});
