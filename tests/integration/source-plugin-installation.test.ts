import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { VerifiedPluginPackage } from '../../apps/api/src/modules/source-reader/application/ports/plugin-package-verifier.port.ts';
import { PluginInstallationService } from '../../apps/api/src/modules/source-reader/application/services/plugin-installation.service.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-plugin-install-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const store = new SqlitePluginStore(database);

const manifest = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'] as const,
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['example.test'], priority: 10 }],
  runtime: { preferredMode: 'isolated' as const },
  permissions: { network: { hosts: ['example.test'] } }
};

function versionInput(version: string, status: 'pending-approval' | 'active' = 'pending-approval') {
  return {
    pluginId: 'demo',
    name: 'Demo',
    version,
    trustLevel: 'local-unverified' as const,
    status,
    packagePath: join(root, 'installed', 'demo', version),
    checksum: `checksum-${version}`,
    signatureStatus: 'unsigned' as const,
    manifestJson: JSON.stringify({ ...manifest, version }),
    sdkRange: manifest.engines.sourceReader,
    installedAt: '2026-07-19T00:00:00.000Z'
  };
}

test.after(async () => {
  database.close();
  await rm(root, { recursive: true, force: true });
});

test('unsigned installation remains pending approval and cannot become active', async () => {
  await store.recordInstallation({
    id: 'install-1',
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    originalPackagePath: '/tmp/demo.source-plugin',
    status: 'pending-approval',
    createdAt: '2026-07-19T00:00:00.000Z'
  });
  await store.upsertPluginVersion(versionInput('1.0.0'));
  await store.replaceRequestedPermissions({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    permissions: [{ permission: 'network', scopeJson: JSON.stringify(['example.test']) }]
  });
  await assert.rejects(
    () => store.activate('demo', '1.0.0', '2026-07-19T00:01:00.000Z'),
    /permissions/i
  );
});

test('failed upgrade activation leaves the previous active version unchanged', async () => {
  await store.approvePermissions({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    approvedBy: 'admin',
    approvedAt: '2026-07-19T00:01:00.000Z'
  });
  await store.activate('demo', '1.0.0', '2026-07-19T00:02:00.000Z');

  await store.upsertPluginVersion(versionInput('1.1.0'));
  await store.replaceRequestedPermissions({
    pluginId: 'demo',
    pluginVersion: '1.1.0',
    permissions: [{ permission: 'browser', scopeJson: '{}' }]
  });
  await assert.rejects(
    () => store.activate('demo', '1.1.0', '2026-07-19T00:03:00.000Z'),
    /permissions/i
  );
  assert.equal((await store.findActive('demo'))?.version, '1.0.0');
});

test('installation service stages verified files and records pending approval', async () => {
  const verified: VerifiedPluginPackage = {
    manifest,
    files: new Map([
      ['manifest.json', Buffer.from(JSON.stringify(manifest))],
      ['dist/index.js', Buffer.from('export default () => ({})')],
      ['checksums.json', Buffer.from('{}')]
    ]),
    packageChecksum: 'package-checksum',
    signatureStatus: 'unsigned',
    trustLevel: 'local-unverified',
    executionMode: 'isolated'
  };
  const service = new PluginInstallationService(
    { verify: async () => verified },
    store,
    join(root, 'plugins'),
    { randomId: () => 'install-service-1' },
    { now: () => new Date('2026-07-19T01:00:00.000Z') }
  );

  const result = await service.install({
    bytes: Buffer.from('package'),
    originalName: 'demo.source-plugin'
  });

  assert.deepEqual(result, {
    installationId: 'install-service-1',
    pluginId: 'demo',
    version: '1.0.0',
    status: 'pending-approval'
  });
  assert.equal(
    await readFile(join(root, 'plugins', 'installed', 'demo', '1.0.0', 'dist/index.js'), 'utf8'),
    'export default () => ({})'
  );
  const row = database.connection
    .prepare('SELECT status FROM source_reader_installations WHERE id=?')
    .get('install-service-1') as { status: string };
  assert.equal(row.status, 'pending-approval');
});
