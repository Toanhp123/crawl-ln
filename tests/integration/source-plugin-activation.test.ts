import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ExternalPluginLoader } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.ts';
import { novelCoolPlugin } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';

const root = await mkdtemp(join(tmpdir(), 'source-plugin-activation-'));
const database = createSqliteDatabase(join(root, 'test.sqlite'));
const store = new SqlitePluginStore(database);

const manifest = {
  id: 'novelcool-content-override',
  name: 'NovelCool Content Override',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['chapter-content'],
  contracts: { 'chapter-content': 1 },
  matchers: [
    {
      hosts: ['novelcool.com'],
      capabilities: ['chapter-content'],
      priority: 200
    }
  ],
  runtime: { preferredMode: 'isolated' },
  permissions: { network: { hosts: ['novelcool.com'] } }
};
const packagePath = join(root, 'installed', manifest.id, manifest.version);

test.before(async () => {
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const entryBytes = Buffer.from('export default {};');
  await mkdir(join(packagePath, 'dist'), { recursive: true });
  await writeFile(join(packagePath, 'manifest.json'), manifestBytes);
  await writeFile(join(packagePath, 'dist', 'index.js'), entryBytes);
  await writeFile(
    join(packagePath, 'checksums.json'),
    JSON.stringify({
      'manifest.json': createHash('sha256').update(manifestBytes).digest('hex'),
      'dist/index.js': createHash('sha256').update(entryBytes).digest('hex')
    })
  );

  await store.upsertPluginVersion({
    pluginId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    trustLevel: 'local-unverified',
    status: 'pending-approval',
    packagePath,
    checksum: 'checksum',
    signatureStatus: 'unsigned',
    manifestJson: JSON.stringify(manifest),
    sdkRange: manifest.engines.sourceReader,
    installedAt: '2026-07-20T00:00:00.000Z'
  });
  await store.replaceRequestedPermissions({
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    permissions: [
      { permission: 'network', scopeJson: JSON.stringify(manifest.permissions.network) }
    ]
  });
  await store.approvePermissions({
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    approvedBy: 'admin',
    approvedAt: '2026-07-20T00:01:00.000Z'
  });
  await store.activate(manifest.id, manifest.version, '2026-07-20T00:02:00.000Z');
});

test.after(async () => {
  database.close();
  await rm(root, { recursive: true, force: true });
});

test('approved external plugin overrides one capability without replacing built-in metadata', async () => {
  const registry = new InMemoryPluginRegistry();
  registry.register(novelCoolPlugin, { trustLevel: 'built-in', executionMode: 'in-process' });
  const loader = new ExternalPluginLoader(store);
  registry.replaceExternal(await loader.loadActive());

  const metadata = await registry.listCandidates({
    url: 'https://novelcool.com/novel/book',
    capability: 'metadata'
  });
  assert.equal(metadata[0]?.plugin.manifest.id, 'novelcool');

  const content = await registry.listCandidates({
    url: 'https://novelcool.com/chapter/1',
    capability: 'chapter-content'
  });
  assert.equal(content[0]?.plugin.manifest.id, 'novelcool-content-override');
  assert.equal(content[0]?.packagePath, packagePath);
});
