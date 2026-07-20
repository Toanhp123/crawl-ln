import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PluginHealthService } from '../../apps/api/src/modules/source-reader/application/services/plugin-health.service.ts';
import { ExternalPluginLoader } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts';
import { SqlitePluginHealthRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin-health.repository.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-plugin-health-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const repository = new SqlitePluginHealthRepository(database);
let now = new Date('2026-07-20T00:00:00.000Z');
let sequence = 0;
const health = new PluginHealthService(
  repository,
  { now: () => now },
  { randomId: () => `health-${++sequence}` },
  { threshold: 5, windowMs: 60_000 }
);

test.after(async () => {
  database.close();
  await rm(root, { recursive: true, force: true });
});

test('repeated chapter-content failures degrade only that capability and recover after window', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await health.recordFailure({
      pluginId: 'demo',
      pluginVersion: '1.0.0',
      capability: 'chapter-content',
      failureCode: 'PLUGIN_RESULT_INVALID',
      durationMs: 10
    });
  }
  assert.equal(await health.isEligible('demo', '1.0.0', 'chapter-content'), false);
  assert.equal(await health.isEligible('demo', '1.0.0', 'metadata'), true);

  now = new Date(now.getTime() + 60_001);
  assert.equal(await health.isEligible('demo', '1.0.0', 'chapter-content'), true);
});

test('tampered active package is quarantined instead of loaded', async () => {
  const pluginId = 'tampered-demo';
  const version = '1.0.0';
  const packagePath = join(root, 'installed', pluginId, version);
  const manifest = {
    id: pluginId,
    name: 'Tampered Demo',
    version,
    engines: { sourceReader: '>=1.0.0 <2.0.0' },
    capabilities: ['metadata'],
    contracts: { metadata: 1 },
    matchers: [{ hosts: ['example.test'], priority: 10 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: ['example.test'] } }
  } as const;
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const entryBytes = Buffer.from('export default { metadata() { return {}; } };');
  const checksums = {
    'manifest.json': createHash('sha256').update(manifestBytes).digest('hex'),
    'dist/index.js': createHash('sha256').update(entryBytes).digest('hex')
  };

  await mkdir(join(packagePath, 'dist'), { recursive: true });
  await writeFile(join(packagePath, 'manifest.json'), manifestBytes);
  await writeFile(join(packagePath, 'dist', 'index.js'), entryBytes);
  await writeFile(join(packagePath, 'checksums.json'), JSON.stringify(checksums));

  const store = new SqlitePluginStore(database);
  await store.upsertPluginVersion({
    pluginId,
    name: manifest.name,
    version,
    trustLevel: 'local-unverified',
    status: 'pending-approval',
    packagePath,
    checksum: 'package-checksum',
    signatureStatus: 'unsigned',
    manifestJson: JSON.stringify(manifest),
    sdkRange: manifest.engines.sourceReader,
    installedAt: now.toISOString()
  });
  await store.replaceRequestedPermissions({
    pluginId,
    pluginVersion: version,
    permissions: [
      { permission: 'network', scopeJson: JSON.stringify(manifest.permissions.network) }
    ]
  });
  await store.approvePermissions({
    pluginId,
    pluginVersion: version,
    approvedBy: 'admin',
    approvedAt: now.toISOString()
  });
  await store.activate(pluginId, version, now.toISOString());

  await writeFile(join(packagePath, 'dist', 'index.js'), 'tampered');

  const loaded = await new ExternalPluginLoader(store, {
    create: async () => {
      throw new Error('tampered package must not reach registration');
    }
  } as never).loadActive();
  assert.equal(
    loaded.some((candidate) => candidate.plugin.manifest.id === pluginId),
    false
  );

  const row = database.connection
    .prepare(
      `SELECT status, quarantine_reason
       FROM source_reader_plugin_versions
       WHERE plugin_id=? AND version=?`
    )
    .get(pluginId, version) as { status: string; quarantine_reason: string | null };
  assert.equal(row.status, 'quarantined');
  assert.match(row.quarantine_reason ?? '', /integrity/i);
});

test('integrity failure quarantines the package and unregisters the plugin', async () => {
  const quarantined: Array<{ pluginId: string; version: string; reason: string }> = [];
  const unregistered: string[] = [];
  const supervised = new PluginHealthService(
    repository,
    { now: () => now },
    { randomId: () => `health-${++sequence}` },
    {
      pluginStore: {
        quarantine: async (pluginId: string, version: string, reason: string) => {
          quarantined.push({ pluginId, version, reason });
        }
      },
      registry: {
        unregister: (pluginId: string) => {
          unregistered.push(pluginId);
        }
      }
    }
  );

  await supervised.quarantineIntegrityFailure({
    pluginId: 'demo',
    pluginVersion: '1.0.0',
    failureCode: 'PLUGIN_PACKAGE_INVALID'
  });

  assert.deepEqual(quarantined, [
    { pluginId: 'demo', version: '1.0.0', reason: 'PLUGIN_PACKAGE_INVALID' }
  ]);
  assert.deepEqual(unregistered, ['demo']);
});

test('repeated sandbox output policy violations quarantine and unregister the plugin', async () => {
  const quarantined: Array<{ pluginId: string; version: string; reason: string }> = [];
  const unregistered: string[] = [];
  const supervised = new PluginHealthService(
    repository,
    { now: () => now },
    { randomId: () => `health-${++sequence}` },
    {
      threshold: 2,
      windowMs: 60_000,
      pluginStore: {
        quarantine: async (pluginId: string, version: string, reason: string) => {
          quarantined.push({ pluginId, version, reason });
        }
      },
      registry: {
        unregister: (pluginId: string) => {
          unregistered.push(pluginId);
        }
      }
    }
  );

  await supervised.recordPolicyViolation({
    pluginId: 'noisy-demo',
    pluginVersion: '1.0.0',
    stream: 'stdout',
    bytes: 10
  });
  assert.deepEqual(quarantined, []);

  await supervised.recordPolicyViolation({
    pluginId: 'noisy-demo',
    pluginVersion: '1.0.0',
    stream: 'stderr',
    bytes: 20
  });

  assert.deepEqual(quarantined, [
    {
      pluginId: 'noisy-demo',
      version: '1.0.0',
      reason: 'PLUGIN_OUTPUT_POLICY_VIOLATION'
    }
  ]);
  assert.deepEqual(unregistered, ['noisy-demo']);
});
