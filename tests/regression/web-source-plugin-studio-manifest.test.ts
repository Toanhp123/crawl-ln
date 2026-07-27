import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { SourcePluginProject } from '../../apps/web/src/entities/source-plugin-project/model/types.ts';
import {
  parseSourcePluginStudioManifest,
  updateSourcePluginStudioManifest
} from '../../apps/web/src/entities/source-plugin-project/model/source-plugin-studio-manifest.ts';
import { createSourcePluginWorkspaceController } from '../../apps/web/src/features/edit-source-plugin-project/model/source-plugin-workspace-controller.ts';

function manifest(overrides: Record<string, unknown> = {}) {
  return `${JSON.stringify(
    {
      id: 'demo-reader',
      name: 'Demo Reader',
      version: '1.0.0',
      engines: { sourceReader: '^3.0.0' },
      capabilities: ['metadata'],
      contracts: { metadata: 1 },
      matchers: [{ hosts: ['example.com'], include: ['/**'], priority: 100 }],
      runtime: { preferredMode: 'isolated' },
      permissions: { network: { hosts: ['example.com'] } },
      ...overrides
    },
    null,
    2
  )}\n`;
}

function project(manifestSource = manifest()): SourcePluginProject {
  return {
    id: 'project-1',
    name: 'Stale database name',
    pluginId: 'stale-id',
    version: '0.0.1',
    hosts: ['stale.example'],
    capabilities: ['identify'],
    selectors: {},
    files: { 'manifest.json': manifestSource, 'src/index.ts': 'export default {}' },
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

test('manifest metadata is parsed from manifest.json instead of draft metadata', () => {
  assert.deepEqual(parseSourcePluginStudioManifest(manifest()), {
    valid: true,
    metadata: {
      name: 'Demo Reader',
      pluginId: 'demo-reader',
      version: '1.0.0',
      hosts: ['example.com'],
      capabilities: ['metadata']
    }
  });
});

test('metadata edits preserve unrelated manifest fields and synchronize host fields', () => {
  const source = manifest({ description: 'Keep me' });
  const updated = updateSourcePluginStudioManifest(source, {
    name: 'Updated Reader',
    pluginId: 'updated-reader',
    version: '2.0.0',
    hosts: ['novels.example', 'cdn.example'],
    capabilities: ['identify', 'metadata']
  });
  const parsed = JSON.parse(updated) as {
    description: string;
    name: string;
    id: string;
    version: string;
    capabilities: string[];
    contracts: Record<string, number>;
    matchers: Array<{ hosts: string[] }>;
    permissions: { network: { hosts: string[] } };
  };

  assert.equal(parsed.description, 'Keep me');
  assert.equal(parsed.name, 'Updated Reader');
  assert.equal(parsed.id, 'updated-reader');
  assert.equal(parsed.version, '2.0.0');
  assert.deepEqual(parsed.capabilities, ['identify', 'metadata']);
  assert.deepEqual(parsed.contracts, { identify: 1, metadata: 1 });
  assert.deepEqual(parsed.matchers[0].hosts, ['novels.example', 'cdn.example']);
  assert.deepEqual(parsed.permissions.network.hosts, ['novels.example', 'cdn.example']);
});

test('invalid manifest JSON remains a draft state with a precise error', () => {
  assert.deepEqual(parseSourcePluginStudioManifest('{'), {
    valid: false,
    error: 'manifest.json must contain valid JSON.'
  });
});

test('workspace mirrors valid manifest metadata when saving files', async () => {
  let savedInput:
    Parameters<Parameters<typeof createSourcePluginWorkspaceController>[0]['save']>[0] | undefined;
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: async (input) => {
      savedInput = input;
      return {
        ...project(input.files['manifest.json']),
        name: input.name ?? 'missing',
        pluginId: input.pluginId ?? 'missing',
        version: input.version ?? 'missing',
        hosts: input.hosts ?? [],
        capabilities: input.capabilities ?? [],
        revision: input.expectedRevision + 1
      };
    }
  });

  controller.updateFile(
    'manifest.json',
    updateSourcePluginStudioManifest(manifest(), {
      name: 'Saved Reader',
      pluginId: 'saved-reader',
      version: '1.2.0',
      hosts: ['saved.example'],
      capabilities: ['chapter-list']
    })
  );
  await controller.flush();

  assert.equal(savedInput?.name, 'Saved Reader');
  assert.equal(savedInput?.pluginId, 'saved-reader');
  assert.equal(savedInput?.version, '1.2.0');
  assert.deepEqual(savedInput?.hosts, ['saved.example']);
  assert.deepEqual(savedInput?.capabilities, ['chapter-list']);
});

test('workspace preserves invalid manifest drafts without overwriting database metadata', async () => {
  let savedInput:
    Parameters<Parameters<typeof createSourcePluginWorkspaceController>[0]['save']>[0] | undefined;
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: async (input) => {
      savedInput = input;
      return { ...project(input.files['manifest.json']), revision: input.expectedRevision + 1 };
    }
  });

  controller.updateFile('manifest.json', '{');
  await controller.flush();

  assert.equal(savedInput?.files['manifest.json'], '{');
  assert.equal(savedInput?.name, undefined);
  assert.equal(savedInput?.pluginId, undefined);
  assert.equal(savedInput?.version, undefined);
});

test('workbench renders manifest metadata and guards plugin actions', async () => {
  const [workbench, toolbar, library, model] = await Promise.all([
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioWorkbench.tsx', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioToolbar.tsx', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioProjectLibrary.tsx', 'utf8'),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/model/use-source-plugin-studio-workbench.ts',
      'utf8'
    )
  ]);

  assert.match(workbench, /PluginStudioManifestEditor/);
  assert.match(workbench, /updateFile\('manifest\.json'/);
  assert.match(toolbar, /actionDisabled = busy \|\| !manifest\.valid/);
  assert.match(toolbar, /metadata\?\.pluginId/);
  assert.match(library, /parseSourcePluginStudioManifest/);
  assert.match(model, /requireValidManifest/);
  assert.match(model, /buildCurrent: buildCurrent && manifest\.valid/);
});
