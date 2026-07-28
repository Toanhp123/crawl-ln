import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourcePluginManifest } from '@novel-tool/source-plugin-sdk';
import { SourceReaderAuthorizationPolicy } from '../../apps/api/src/modules/source-reader/application/admin/policies/source-reader-authorization.policy.ts';
import { PluginStudioService } from '../../apps/api/src/modules/source-reader/application/admin/services/plugin-studio.service.ts';
import { SourcePluginArchiveService } from '../../apps/api/src/modules/source-reader/application/admin/services/source-plugin-archive.service.ts';
import {
  ImportSourcePluginProjectUseCase,
  InspectSourcePluginArchiveUseCase,
  InstallSourcePluginArchiveUseCase
} from '../../apps/api/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugin-archives.usecase.ts';
import type {
  InspectedSourcePluginArchive,
  SourcePluginArchiveInspectorPort
} from '../../apps/api/src/modules/source-reader/application/ports/source-plugin-archive-inspector.port.ts';
import type {
  PluginStudioBuilderPort,
  SourcePluginStudioBuildInput,
  SourcePluginStudioBuildResult
} from '../../apps/api/src/modules/source-reader/application/ports/plugin-studio-builder.port.ts';
import type {
  PluginStudioDraftRepository,
  SourcePluginStudioDraft
} from '../../apps/api/src/modules/source-reader/application/ports/plugin-studio-draft.repository.ts';

const now = new Date('2026-07-28T12:00:00.000Z');
const admin = { id: 'admin-1', roles: ['source-admin'] as const };

function manifest(id: string): SourcePluginManifest {
  return {
    id,
    name: 'Imported Plugin',
    version: '2.0.0',
    engines: { sourceReader: '^1.0.0' },
    capabilities: ['identify', 'metadata'],
    contracts: { identify: 1, metadata: 1 },
    matchers: [{ hosts: ['import.example'], include: ['/**'], priority: 100 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: ['import.example'] } }
  };
}

function source(id = 'imported-plugin'): SourcePluginStudioBuildInput {
  return {
    id,
    name: 'Imported Plugin',
    version: '2.0.0',
    hosts: ['import.example'],
    capabilities: ['identify', 'metadata'],
    selectors: {},
    files: {
      'manifest.json': JSON.stringify(manifest(id)),
      'src/index.ts': 'export default {}'
    }
  };
}

function inspectedSource(checksum = 'source-checksum'): InspectedSourcePluginArchive {
  const input = source();
  return {
    preview: {
      checksum,
      kind: 'studio-source',
      pluginId: input.id,
      name: input.name,
      version: input.version,
      hosts: input.hosts,
      capabilities: input.capabilities,
      files: Object.keys(input.files),
      ignoredFiles: []
    },
    source: input
  };
}

function inspectedBuilt(checksum = 'built-checksum'): InspectedSourcePluginArchive {
  return {
    preview: {
      checksum,
      kind: 'built-package',
      pluginId: 'built-plugin',
      name: 'Built Plugin',
      version: '1.0.0',
      hosts: ['built.example'],
      capabilities: ['identify'],
      files: ['manifest.json', 'dist/index.js', 'checksums.json'],
      ignoredFiles: []
    },
    artifact: {
      bytes: Uint8Array.from([1, 2, 3]),
      fileName: 'built-plugin-1.0.0.source-plugin'
    }
  };
}

class MemoryDrafts implements PluginStudioDraftRepository {
  constructor(
    readonly values: SourcePluginStudioDraft[] = [],
    private readonly events: string[] = []
  ) {}

  async create(draft: SourcePluginStudioDraft): Promise<SourcePluginStudioDraft> {
    this.events.push('draft:create');
    this.values.push({ ...draft });
    return { ...draft };
  }

  async findById(id: string): Promise<SourcePluginStudioDraft | undefined> {
    const draft = this.values.find((item) => item.id === id);
    return draft ? { ...draft } : undefined;
  }

  async list(): Promise<SourcePluginStudioDraft[]> {
    return this.values.map((draft) => ({ ...draft }));
  }

  async update(
    id: string,
    patch: Partial<Omit<SourcePluginStudioDraft, 'id' | 'createdAt'>>,
    expectedRevision?: number
  ): Promise<SourcePluginStudioDraft> {
    this.events.push('draft:update');
    const index = this.values.findIndex((item) => item.id === id);
    assert.notEqual(index, -1);
    const current = this.values[index]!;
    assert.equal(expectedRevision, current.revision ?? 1);
    const updated = { ...current, ...patch };
    this.values[index] = updated;
    return { ...updated };
  }

  async remove(id: string): Promise<void> {
    const index = this.values.findIndex((item) => item.id === id);
    if (index >= 0) this.values.splice(index, 1);
  }
}

function fixture(
  inspected: InspectedSourcePluginArchive,
  initialDrafts: SourcePluginStudioDraft[] = []
) {
  const events: string[] = [];
  const drafts = new MemoryDrafts(initialDrafts, events);
  const inspector: SourcePluginArchiveInspectorPort = {
    async inspect() {
      events.push('inspect');
      return inspected;
    }
  };
  const builder: PluginStudioBuilderPort = {
    createScaffold() {
      throw new Error('createScaffold must not run in archive workflows');
    },
    async build(input): Promise<SourcePluginStudioBuildResult> {
      events.push('build');
      return {
        manifest: manifest(input.id),
        files: {},
        packageBytes: Uint8Array.from([7, 8, 9]),
        artifactName: `${input.id}-${input.version}.source-plugin`,
        checksum: 'built-from-source'
      };
    }
  };
  const installer = {
    async install(input: { bytes: Uint8Array; originalName: string }) {
      events.push('install');
      return {
        pluginId: input.originalName.split('-')[0],
        version: '2.0.0',
        status: 'pending-approval',
        packagePath: 'must-not-leak'
      };
    }
  };
  let id = 0;
  const studio = new PluginStudioService({
    drafts,
    builder,
    verifier: { verify: async () => ({}) as never },
    installer,
    ids: { randomId: () => `draft-${++id}` },
    clock: { now: () => now }
  });
  const service = new SourcePluginArchiveService({ inspector, builder, drafts, studio, installer });
  return { events, drafts, service };
}

test('archive inspection adds matching project conflicts without mutation', async () => {
  const existing: SourcePluginStudioDraft = {
    id: 'existing-1',
    name: 'Existing Project',
    pluginId: 'imported-plugin',
    version: '1.0.0',
    hosts: ['import.example'],
    capabilities: ['identify'],
    selectors: {},
    files: { 'manifest.json': '{}', 'src/index.ts': '' },
    revision: 4,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const { service, drafts, events } = fixture(inspectedSource(), [existing]);

  const preview = await service.inspect({ bytes: Uint8Array.of(1), originalName: 'source.zip' });

  assert.deepEqual(preview.conflicts, [
    { id: 'existing-1', name: 'Existing Project', version: '1.0.0', revision: 4 }
  ]);
  assert.equal(drafts.values.length, 1);
  assert.deepEqual(events, ['inspect']);
});

test('built archive install bypasses Studio build and drafts', async () => {
  const { service, drafts, events } = fixture(inspectedBuilt());

  const result = await service.install({
    bytes: Uint8Array.of(1),
    originalName: 'package.zip',
    expectedChecksum: 'built-checksum'
  });

  assert.equal(result.status, 'pending-approval');
  assert.equal('packagePath' in result, false);
  assert.equal(drafts.values.length, 0);
  assert.deepEqual(events, ['inspect', 'install']);
});

test('source archive install builds temporarily and never creates a draft', async () => {
  const { service, drafts, events } = fixture(inspectedSource());

  await service.install({
    bytes: Uint8Array.of(1),
    originalName: 'source.zip',
    expectedChecksum: 'source-checksum'
  });

  assert.equal(drafts.values.length, 0);
  assert.deepEqual(events, ['inspect', 'build', 'install']);
});

test('checksum mismatch stops every archive side effect', async () => {
  const { service, drafts, events } = fixture(inspectedSource());

  await assert.rejects(
    () =>
      service.install({
        bytes: Uint8Array.of(1),
        originalName: 'source.zip',
        expectedChecksum: 'different-checksum'
      }),
    /checksum/i
  );

  assert.equal(drafts.values.length, 0);
  assert.deepEqual(events, ['inspect']);
});

test('create-copy import creates one clean revision-one draft without build or install', async () => {
  const { service, drafts, events } = fixture(inspectedSource());

  const imported = await service.importProject({
    bytes: Uint8Array.of(1),
    originalName: 'source.zip',
    expectedChecksum: 'source-checksum',
    resolution: { type: 'create-copy' }
  });

  assert.equal(imported.id, 'draft-1');
  assert.equal(imported.revision, 1);
  assert.equal(imported.artifactChecksum, undefined);
  assert.equal(imported.builtRevision, undefined);
  assert.equal(drafts.values.length, 1);
  assert.deepEqual(events, ['inspect', 'draft:create']);
});

test('update import replaces source metadata once and clears previous build metadata', async () => {
  const existing: SourcePluginStudioDraft = {
    id: 'existing-1',
    name: 'Old Name',
    pluginId: 'imported-plugin',
    version: '1.0.0',
    hosts: ['old.example'],
    capabilities: ['identify'],
    selectors: { title: 'h1' },
    files: { 'manifest.json': '{}', 'src/index.ts': 'old' },
    revision: 3,
    artifactChecksum: 'old-build',
    builtRevision: 3,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  };
  const { service, drafts, events } = fixture(inspectedSource(), [existing]);

  const imported = await service.importProject({
    bytes: Uint8Array.of(1),
    originalName: 'source.zip',
    expectedChecksum: 'source-checksum',
    resolution: { type: 'update', projectId: 'existing-1', expectedRevision: 3 }
  });

  assert.equal(imported.revision, 4);
  assert.equal(imported.name, 'Imported Plugin');
  assert.deepEqual(imported.hosts, ['import.example']);
  assert.equal(imported.files['src/index.ts'], 'export default {}');
  assert.equal(imported.artifactChecksum, undefined);
  assert.equal(imported.builtRevision, undefined);
  assert.equal(imported.createdAt, '2026-07-01T00:00:00.000Z');
  assert.equal(drafts.values.length, 1);
  assert.deepEqual(events, ['inspect', 'draft:update']);
});

test('built packages cannot be imported as Studio projects', async () => {
  const { service, drafts, events } = fixture(inspectedBuilt());

  await assert.rejects(
    () =>
      service.importProject({
        bytes: Uint8Array.of(1),
        originalName: 'package.zip',
        expectedChecksum: 'built-checksum',
        resolution: { type: 'create-copy' }
      }),
    /built package.*cannot.*import/i
  );
  assert.equal(drafts.values.length, 0);
  assert.deepEqual(events, ['inspect']);
});

test('archive use cases require source-admin before inspection', async () => {
  const { service, events } = fixture(inspectedSource());
  const authorization = new SourceReaderAuthorizationPolicy();
  const inspect = new InspectSourcePluginArchiveUseCase(authorization, service);
  const install = new InstallSourcePluginArchiveUseCase(authorization, service);
  const importProject = new ImportSourcePluginProjectUseCase(authorization, service);
  const actor = { id: 'reader-1', roles: ['reader'] as const };

  assert.throws(() =>
    inspect.execute({ actor, bytes: Uint8Array.of(1), originalName: 'source.zip' })
  );
  assert.throws(() =>
    install.execute({
      actor,
      bytes: Uint8Array.of(1),
      originalName: 'source.zip',
      expectedChecksum: 'source-checksum'
    })
  );
  assert.throws(() =>
    importProject.execute({
      actor,
      bytes: Uint8Array.of(1),
      originalName: 'source.zip',
      expectedChecksum: 'source-checksum',
      resolution: { type: 'create-copy' }
    })
  );
  assert.deepEqual(events, []);

  const preview = await inspect.execute({
    actor: admin,
    bytes: Uint8Array.of(1),
    originalName: 'source.zip'
  });
  assert.equal(preview.pluginId, 'imported-plugin');
});
