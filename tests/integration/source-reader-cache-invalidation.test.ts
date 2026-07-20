import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { MemoryReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import { SqliteReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/cache/sqlite-reader.cache.ts';
import { SourceReaderInvalidationService } from '../../apps/api/src/modules/source-reader/application/services/source-reader-invalidation.service.ts';
import type { ReaderCacheMetadata } from '../../apps/api/src/modules/source-reader/application/ports/reader-cache.port.ts';

function metadata(
  scope: ReaderCacheMetadata['scope'],
  identity: string,
  tags: string[]
): ReaderCacheMetadata {
  return {
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    capability: 'metadata',
    contractVersion: '1',
    extensionContractVersions: { premium: '2' },
    requestFingerprint: `request-${identity}`,
    normalizedUrl: 'https://example.test/book',
    scope,
    scopeIdentityHash: `scope-${identity}`,
    networkIdentityHash: 'network-direct',
    tags
  };
}

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'source-reader-invalidation-'));
  const database = createSqliteDatabase(join(root, 'test.sqlite'));
  t.after(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    database,
    persistent: new SqliteReaderCache(database),
    memory: new MemoryReaderCache(20)
  };
}

test('migration 21 stores real metadata and indexed tags', async (t) => {
  const { database, persistent } = await fixture(t);
  await persistent.set('account-a', {
    value: { private: true },
    expiresAt: Date.now() + 60_000,
    metadata: metadata('account', 'credential-a', ['credential:credential-a', 'plugin:demo'])
  });
  const row = database.connection
    .prepare(
      `SELECT plugin_id, plugin_version, capability, contract_version,
            extension_contract_versions_json, scope, scope_identity_hash,
            network_identity_hash
       FROM source_reader_cache_entries WHERE cache_key=?`
    )
    .get('account-a') as Record<string, unknown>;
  assert.deepEqual(
    { ...row },
    {
      plugin_id: 'demo',
      plugin_version: '1.0.0',
      capability: 'metadata',
      contract_version: 1,
      extension_contract_versions_json: JSON.stringify({ premium: '2' }),
      scope: 'account',
      scope_identity_hash: 'scope-credential-a',
      network_identity_hash: 'network-direct'
    }
  );
  const tags = database.connection
    .prepare('SELECT tag FROM source_reader_cache_tags WHERE cache_key=? ORDER BY tag')
    .all('account-a')
    .map((item) => (item as { tag: string }).tag);
  assert.deepEqual(tags, ['credential:credential-a', 'plugin:demo']);
});

test('credential invalidation removes only matching private rows and closes matching handles', async (t) => {
  const { persistent, memory } = await fixture(t);
  const entries = [
    ['public', 'public', ['plugin:demo']],
    ['account-a', 'account', ['credential:credential-a']],
    ['session-a', 'session', ['credential:credential-a', 'session:session-a']],
    ['account-b', 'account', ['credential:credential-b']]
  ] as const;
  for (const [key, scope, tags] of entries) {
    const entry = {
      value: { key },
      expiresAt: Date.now() + 60_000,
      metadata: metadata(scope, key, [...tags])
    };
    await persistent.set(key, entry);
    await memory.set(key, entry);
  }
  const sessionEvents: string[] = [];
  const browserEvents: string[] = [];
  const observations: Array<{ eventType: string; affectedCount: number }> = [];
  const invalidation = new SourceReaderInvalidationService(
    {
      revokeMatching: async (event) => {
        sessionEvents.push(event.type);
        return 2;
      }
    },
    {
      closeMatching: async (event) => {
        browserEvents.push(event.type);
        return 1;
      }
    },
    memory,
    persistent,
    { invalidationFinished: (event) => observations.push(event) }
  );

  await invalidation.invalidate({ type: 'credential-updated', credentialId: 'credential-a' });

  for (const cache of [memory, persistent]) {
    assert.equal(await cache.get('account-a'), undefined);
    assert.equal(await cache.get('session-a'), undefined);
    assert.ok(await cache.get('public'));
    assert.ok(await cache.get('account-b'));
  }
  assert.deepEqual(sessionEvents, ['credential-updated']);
  assert.deepEqual(browserEvents, ['credential-updated']);
  assert.deepEqual(observations, [{ eventType: 'credential-updated', affectedCount: 3 }]);
});
