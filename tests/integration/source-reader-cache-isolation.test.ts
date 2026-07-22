import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api-legacy/src/shared/database/sqlite.ts';
import { SqliteReaderCache } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/cache/sqlite-reader.cache.ts';
import { TieredReaderCache } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/cache/tiered-reader.cache.ts';
import { MemoryReaderCache } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/cache/memory-reader.cache.ts';
import type { ReaderCacheMetadata } from '../../apps/api-legacy/src/modules/source-reader/application/ports/reader-cache.port.ts';

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
    extensionContractVersions: {},
    requestFingerprint: `request-${identity}`,
    scope,
    scopeIdentityHash: `scope-${identity}`,
    networkIdentityHash: 'direct',
    tags
  };
}

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'source-reader-cache-'));
  const database = createSqliteDatabase(join(root, 'test.sqlite'));
  t.after(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  return { database, cache: new SqliteReaderCache(database) };
}

test('account-scoped cache keys cannot cross account identity', async (t) => {
  const { cache } = await fixture(t);
  await cache.set('account-a-key', {
    value: { premium: true },
    expiresAt: Date.now() + 60_000,
    metadata: metadata('account', 'account-a', ['credential:account-a'])
  });
  assert.deepEqual((await cache.get<{ premium: boolean }>('account-a-key'))?.value, {
    premium: true
  });
  assert.equal(await cache.get('account-b-key'), undefined);
});

test('tag invalidation removes matching persisted entries only', async (t) => {
  const { cache } = await fixture(t);
  await cache.set('one', {
    value: 1,
    expiresAt: Date.now() + 60_000,
    metadata: metadata('public', 'one', ['plugin:one'])
  });
  await cache.set('two', {
    value: 2,
    expiresAt: Date.now() + 60_000,
    metadata: metadata('public', 'two', ['plugin:two'])
  });
  await cache.invalidate(['plugin:one']);
  assert.equal(await cache.get('one'), undefined);
  assert.equal((await cache.get<number>('two'))?.value, 2);
});

test('tiered cache hydrates memory from persisted state', async (t) => {
  const { cache: persistent } = await fixture(t);
  await persistent.set('persisted', {
    value: { title: 'Cached' },
    expiresAt: Date.now() + 60_000,
    metadata: metadata('public', 'persisted', ['plugin:demo'])
  });
  const memory = new MemoryReaderCache(10);
  const tiered = new TieredReaderCache(memory, persistent);
  assert.deepEqual((await tiered.get<{ title: string }>('persisted'))?.value, {
    title: 'Cached'
  });
  await persistent.invalidate(['plugin:demo']);
  assert.deepEqual((await memory.get<{ title: string }>('persisted'))?.value, {
    title: 'Cached'
  });
});
