import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SourcePluginStudioBuilder } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/studio/source-plugin-studio.builder.ts';
import { PluginStudioService } from '../../apps/api/src/modules/source-reader/application/admin/services/plugin-studio.service.ts';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';
import { SqlitePluginStudioDraftRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin-studio-draft.repository.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/infrastructure/migrations/001-source-reader-schema.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { ExternalProcessSupervisor } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';
import { SourceReaderAuthorizationPolicy } from '../../apps/api/src/modules/source-reader/application/admin/policies/source-reader-authorization.policy.ts';
import { CreatePluginStudioProjectUseCase } from '../../apps/api/src/modules/source-reader/application/admin/use-cases/studio/manage-plugin-studio.usecase.ts';

test('plugin studio creates a valid SDK scaffold and package', async (t) => {
  const storage = await mkdtemp(join(tmpdir(), 'plugin-studio-builder-'));
  t.after(() => rm(storage, { recursive: true, force: true }));
  const builder = new SourcePluginStudioBuilder({
    outputDirectory: storage,
    sdkVersion: '^1.0.0'
  });

  const result = await builder.build({
    id: 'demo-reader',
    name: 'Demo Reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['identify', 'metadata'],
    selectors: { title: 'title', author: '.author', cover: 'img.cover' },
    files: {}
  });

  assert.equal(result.manifest.id, 'demo-reader');
  assert.match(result.files['dist/index.js']!, /readMetadata/);
  assert.match(result.files['dist/index.js']!, /initialize/);
  assert.ok(result.packageBytes.byteLength > 0);
  assert.equal(result.artifactName, 'demo-reader-1.0.0.source-plugin');
  const verified = await new SourcePluginPackageVerifier(new StaticTrustStore([])).verify(
    result.packageBytes
  );
  assert.equal(verified.trustLevel, 'local-unverified');
  const rebuilt = await builder.build({
    id: 'demo-reader',
    name: 'Demo Reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['identify', 'metadata'],
    selectors: { title: 'title', author: '.author', cover: 'img.cover' },
    files: {}
  });
  assert.equal(rebuilt.checksum, result.checksum);
  assert.deepEqual(rebuilt.packageBytes, result.packageBytes);
});

test('plugin studio rejects imports outside the SDK and draft source tree', async (t) => {
  const storage = await mkdtemp(join(tmpdir(), 'plugin-studio-import-policy-'));
  t.after(() => rm(storage, { recursive: true, force: true }));
  const builder = new SourcePluginStudioBuilder({
    outputDirectory: storage,
    sdkVersion: '^1.0.0'
  });
  const manifest = builder.createScaffold({
    id: 'unsafe-reader',
    name: 'Unsafe Reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['metadata'],
    selectors: { title: 'title' },
    files: {}
  })['manifest.json']!;

  await assert.rejects(
    () =>
      builder.build({
        id: 'unsafe-reader',
        name: 'Unsafe Reader',
        version: '1.0.0',
        hosts: ['example.com'],
        capabilities: ['metadata'],
        selectors: { title: 'title' },
        files: {
          'manifest.json': manifest,
          'src/index.ts': "import fs from 'node:fs'; export default fs;"
        }
      }),
    /import is not allowed/i
  );
  await assert.rejects(
    () =>
      builder.build({
        id: 'unsafe-reader',
        name: 'Unsafe Reader',
        version: '1.0.0',
        hosts: ['example.com'],
        capabilities: ['metadata'],
        selectors: { title: 'title' },
        files: {
          'manifest.json': manifest,
          'src/index.ts': "import value from '../../../package.json'; export default value;"
        }
      }),
    /outside|not allowed|could not resolve/i
  );
});

test('plugin studio draft repository round-trips files and metadata', async (t) => {
  const database = new SqliteDatabase(':memory:');
  t.after(() => database.close());
  for (const migration of sourceReaderMigrations) migration.up(database.connection);
  const repository = new SqlitePluginStudioDraftRepository(database);

  const created = await repository.create({
    id: 'project-1',
    name: 'Demo Reader',
    pluginId: 'demo-reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['metadata'],
    selectors: { title: 'title' },
    files: { 'manifest.json': '{}', 'src/index.ts': 'export default {}' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });

  assert.deepEqual(await repository.findById(created.id), created);
  const updated = await repository.update(created.id, {
    files: { 'manifest.json': '{"ok":true}' },
    updatedAt: '2026-01-01T01:00:00.000Z'
  });
  assert.equal(updated.files['manifest.json'], '{"ok":true}');
  assert.equal((await repository.list()).length, 1);
  await repository.remove(created.id);
  assert.equal(await repository.findById(created.id), undefined);
});

test('plugin studio service keeps revisions coherent and installs the rebuilt package', async (t) => {
  const storage = await mkdtemp(join(tmpdir(), 'plugin-studio-service-'));
  t.after(() => rm(storage, { recursive: true, force: true }));
  const database = new SqliteDatabase(':memory:');
  t.after(() => database.close());
  for (const migration of sourceReaderMigrations) migration.up(database.connection);
  const repository = new SqlitePluginStudioDraftRepository(database);
  const builder = new SourcePluginStudioBuilder({
    outputDirectory: storage,
    sdkVersion: '^1.0.0'
  });
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  let installedBytes = 0;
  const testSupervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 20
  });
  const service = new PluginStudioService({
    drafts: repository,
    builder,
    verifier,
    installer: {
      async install(input) {
        installedBytes = input.bytes.byteLength;
        return { pluginId: 'demo-reader', version: '1.0.0', status: 'pending-approval' };
      }
    },
    testSupervisor,
    ids: { randomId: () => 'project-1' },
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') }
  });

  const created = await service.create({
    name: 'Demo Reader',
    pluginId: 'demo-reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['identify', 'metadata'],
    selectors: { title: 'title' }
  });
  assert.equal(created.revision, 1);
  assert.ok(created.files['src/index.ts']);
  const updated = await service.update(created.id, {
    expectedRevision: 1,
    files: { ...created.files, 'tests/smoke.test.ts': '// edited' }
  });
  assert.equal(updated.revision, 2);
  await assert.rejects(
    () => service.update(created.id, { expectedRevision: 1, files: created.files }),
    /revision/i
  );

  const built = await service.build(created.id);
  assert.equal(built.revision, 2);
  assert.equal(built.stale, false);
  const tested = await service.test(created.id);
  assert.equal(tested.status, 'healthy');
  assert.deepEqual(tested.checks, ['verified', 'initialized', 'healthy', 'shutdown']);
  const installed = await service.install(created.id);
  assert.equal(installed.status, 'pending-approval');
  assert.ok(installedBytes > 0);
});

test('plugin studio management requires source-admin authority', async () => {
  let calls = 0;
  const useCase = new CreatePluginStudioProjectUseCase(new SourceReaderAuthorizationPolicy(), {
    async create(input) {
      calls += 1;
      return input;
    }
  });
  const input = {
    name: 'Demo',
    pluginId: 'demo-reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['metadata'] as const,
    selectors: { title: 'title' }
  };
  assert.throws(
    () => useCase.execute({ actor: { roles: ['source-manager'] }, ...input }),
    /source-admin/i
  );
  await useCase.execute({ actor: { roles: ['source-admin'] }, ...input });
  assert.equal(calls, 1);
});
