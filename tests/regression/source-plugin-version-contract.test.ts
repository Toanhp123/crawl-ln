import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/infrastructure/migrations/001-source-reader-schema.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

function migratedDatabase(t: test.TestContext): SqliteDatabase {
  const database = new SqliteDatabase(':memory:');
  for (const migration of sourceReaderMigrations) migration.up(database.connection);
  t.after(() => database.close());
  return database;
}

function manifest(version: string, host: string, capability: 'metadata' | 'chapter-content') {
  return {
    id: 'fixture-source',
    name: 'Fixture Source',
    version,
    engines: { sourceReader: '^1.0.0' },
    capabilities: [capability],
    contracts: { [capability]: 1 },
    matchers: [{ hosts: [host], priority: 10 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: [host] } }
  };
}

async function installVersion(
  store: SqlitePluginStore,
  input: {
    version: string;
    host: string;
    capability: 'metadata' | 'chapter-content';
    installedAt: string;
  }
) {
  const value = manifest(input.version, input.host, input.capability);
  await store.upsertPluginVersion({
    pluginId: value.id,
    name: value.name,
    version: value.version,
    trustLevel: 'local-unverified',
    status: 'pending-approval',
    packagePath: `C:/plugins/${value.id}/${value.version}`,
    checksum: input.version.replaceAll('.', '').padEnd(64, '0'),
    signatureStatus: 'unsigned',
    manifestJson: JSON.stringify(value),
    sdkRange: value.engines.sourceReader,
    installedAt: input.installedAt,
    sandboxProtocolVersion: 1
  });
  await store.replaceRequestedPermissions({
    pluginId: value.id,
    pluginVersion: value.version,
    permissions: [{ permission: 'network', scopeJson: JSON.stringify([input.host]) }]
  });
}

test('inactive plugin descriptors expose the latest installed version without inventing an active version', async (t) => {
  const store = new SqlitePluginStore(migratedDatabase(t));
  await installVersion(store, {
    version: '2.0.0',
    host: 'latest.example.test',
    capability: 'chapter-content',
    installedAt: '2026-07-26T02:00:00.000Z'
  });

  const [descriptor] = await store.listInstalled();
  assert.equal(descriptor?.latestVersion, '2.0.0');
  assert.equal(descriptor && 'activeVersion' in descriptor, false);
  assert.equal(descriptor?.permissionsPending, true);
  assert.deepEqual(descriptor?.capabilities, ['chapter-content']);
  assert.deepEqual(descriptor?.domains, ['latest.example.test']);
});

test('active and latest plugin versions remain distinct while permissions track the latest candidate', async (t) => {
  const store = new SqlitePluginStore(migratedDatabase(t));
  await installVersion(store, {
    version: '1.0.0',
    host: 'active.example.test',
    capability: 'metadata',
    installedAt: '2026-07-26T01:00:00.000Z'
  });
  await store.approvePermissions({
    pluginId: 'fixture-source',
    pluginVersion: '1.0.0',
    approvedBy: 'admin-1',
    approvedAt: '2026-07-26T01:05:00.000Z'
  });
  await store.activateCandidateAtomically('fixture-source', '1.0.0', '2026-07-26T01:10:00.000Z');
  await installVersion(store, {
    version: '2.0.0',
    host: 'latest.example.test',
    capability: 'chapter-content',
    installedAt: '2026-07-26T02:00:00.000Z'
  });

  const [descriptor] = await store.listInstalled();
  assert.equal(descriptor?.latestVersion, '2.0.0');
  assert.equal(descriptor?.activeVersion, '1.0.0');
  assert.equal(descriptor?.enabled, true);
  assert.equal(descriptor?.permissionsPending, true);
  assert.deepEqual(descriptor?.capabilities, ['chapter-content']);
  assert.deepEqual(descriptor?.domains, ['latest.example.test']);
});

test('installation commit rolls back version and permissions together', async (t) => {
  const store = new SqlitePluginStore(migratedDatabase(t));
  await installVersion(store, {
    version: '1.0.0',
    host: 'old.example.test',
    capability: 'metadata',
    installedAt: '2026-07-26T01:00:00.000Z'
  });
  await store.approvePermissions({
    pluginId: 'fixture-source',
    pluginVersion: '1.0.0',
    approvedBy: 'admin-1',
    approvedAt: '2026-07-26T01:05:00.000Z'
  });
  const replacement = manifest('1.0.0', 'new.example.test', 'chapter-content');

  await assert.rejects(() =>
    store.commitInstallation({
      version: {
        pluginId: replacement.id,
        name: replacement.name,
        version: replacement.version,
        trustLevel: 'local-unverified',
        status: 'pending-approval',
        packagePath: 'C:/plugins/fixture-source/1.0.0',
        checksum: 'new-checksum',
        signatureStatus: 'unsigned',
        manifestJson: JSON.stringify(replacement),
        sdkRange: replacement.engines.sourceReader,
        installedAt: '2026-07-26T02:00:00.000Z',
        sandboxProtocolVersion: 1
      },
      permissions: [
        { permission: 'network', scopeJson: JSON.stringify(['new.example.test']) },
        { permission: 'network', scopeJson: JSON.stringify(['new.example.test']) }
      ],
      installation: {
        id: 'replacement-installation',
        pluginId: replacement.id,
        pluginVersion: replacement.version,
        originalPackagePath: 'C:/packages/replacement.source-plugin',
        status: 'pending-approval',
        createdAt: '2026-07-26T02:00:00.000Z',
        completedAt: '2026-07-26T02:00:01.000Z'
      }
    })
  );

  const current = await store.findVersion('fixture-source', '1.0.0');
  assert.equal(current?.manifest.matchers[0]?.hosts[0], 'old.example.test');
  assert.equal(current?.checksum, '100'.padEnd(64, '0'));
  assert.deepEqual(await store.listPermissions('fixture-source'), [
    {
      pluginId: 'fixture-source',
      pluginVersion: '1.0.0',
      permission: 'network',
      scope: ['old.example.test'],
      status: 'approved',
      approvedBy: 'admin-1',
      approvedAt: '2026-07-26T01:05:00.000Z'
    }
  ]);
});
