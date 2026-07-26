import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

type FixtureFiles = Record<string, string>;

async function createFixture(files: FixtureFiles = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-plugin-workspaces-'));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

test('returns no plugin workspaces when the plugins directory is absent or empty', async () => {
  const absentRoot = await createFixture();
  const emptyRoot = await createFixture({ 'plugins/.gitkeep': '' });
  try {
    const { discoverSourcePluginWorkspaces } =
      await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
    assert.deepEqual(await discoverSourcePluginWorkspaces(absentRoot), []);
    assert.deepEqual(await discoverSourcePluginWorkspaces(emptyRoot), []);
  } finally {
    await Promise.all([
      rm(absentRoot, { recursive: true, force: true }),
      rm(emptyRoot, { recursive: true, force: true })
    ]);
  }
});

test('discovers direct plugin workspaces in manifest id order with normalized metadata', async () => {
  const alphaPackage = {
    name: '@fixture/source-alpha',
    version: '1.2.3',
    scripts: { test: 'node tests.js' }
  };
  const alphaManifest = { id: 'alpha-source', name: 'Alpha', version: '1.2.3' };
  const zetaPackage = { name: '@fixture/source-zeta', version: '2.0.0' };
  const zetaManifest = { id: 'zeta-source', name: 'Zeta', version: '2.0.0' };
  const root = await createFixture({
    'plugins/zeta/package.json': json(zetaPackage),
    'plugins/zeta/manifest.json': json(zetaManifest),
    'plugins/alpha/package.json': json(alphaPackage),
    'plugins/alpha/manifest.json': json(alphaManifest),
    'plugins/alpha/tsconfig.json': json({ compilerOptions: {} })
  });

  try {
    const { discoverSourcePluginWorkspaces } =
      await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
    const workspaces = await discoverSourcePluginWorkspaces(root);
    assert.deepEqual(
      workspaces.map((workspace) => ({
        id: workspace.id,
        version: workspace.version,
        workspaceName: workspace.workspaceName,
        workspaceRoot: relative(root, workspace.workspaceRoot),
        packageJsonPath: relative(root, workspace.packageJsonPath),
        manifestPath: relative(root, workspace.manifestPath),
        tsconfigPath: workspace.tsconfigPath ? relative(root, workspace.tsconfigPath) : undefined,
        distPath: relative(root, workspace.distPath),
        packageJson: workspace.packageJson,
        manifest: workspace.manifest
      })),
      [
        {
          id: 'alpha-source',
          version: '1.2.3',
          workspaceName: '@fixture/source-alpha',
          workspaceRoot: join('plugins', 'alpha'),
          packageJsonPath: join('plugins', 'alpha', 'package.json'),
          manifestPath: join('plugins', 'alpha', 'manifest.json'),
          tsconfigPath: join('plugins', 'alpha', 'tsconfig.json'),
          distPath: join('plugins', 'alpha', 'dist'),
          packageJson: alphaPackage,
          manifest: alphaManifest
        },
        {
          id: 'zeta-source',
          version: '2.0.0',
          workspaceName: '@fixture/source-zeta',
          workspaceRoot: join('plugins', 'zeta'),
          packageJsonPath: join('plugins', 'zeta', 'package.json'),
          manifestPath: join('plugins', 'zeta', 'manifest.json'),
          tsconfigPath: undefined,
          distPath: join('plugins', 'zeta', 'dist'),
          packageJson: zetaPackage,
          manifest: zetaManifest
        }
      ]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a plugin workspace whose package and manifest versions differ', async () => {
  const root = await createFixture({
    'plugins/mismatch/package.json': json({
      name: '@fixture/mismatch',
      version: '1.0.0'
    }),
    'plugins/mismatch/manifest.json': json({ id: 'mismatch', version: '2.0.0' })
  });
  try {
    const { discoverSourcePluginWorkspaces } =
      await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
    await assert.rejects(
      () => discoverSourcePluginWorkspaces(root),
      /mismatch.*package and manifest versions must match/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a plugin directory that is missing its manifest', async () => {
  const root = await createFixture({
    'plugins/missing/package.json': json({ name: '@fixture/missing', version: '1.0.0' })
  });
  try {
    const { discoverSourcePluginWorkspaces } =
      await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
    await assert.rejects(() => discoverSourcePluginWorkspaces(root), /missing.*manifest\.json/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects duplicate manifest ids even when their versions differ', async () => {
  const root = await createFixture({
    'plugins/first/package.json': json({ name: '@fixture/first', version: '1.0.0' }),
    'plugins/first/manifest.json': json({ id: 'duplicate-source', version: '1.0.0' }),
    'plugins/second/package.json': json({ name: '@fixture/second', version: '2.0.0' }),
    'plugins/second/manifest.json': json({ id: 'duplicate-source', version: '2.0.0' })
  });
  try {
    const { discoverSourcePluginWorkspaces } =
      await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
    await assert.rejects(
      () => discoverSourcePluginWorkspaces(root),
      /duplicate source plugin id: duplicate-source/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects duplicate plugin artifact identities deterministically', async () => {
  const root = await createFixture({
    'plugins/first/package.json': json({ name: '@fixture/first', version: '1.0.0' }),
    'plugins/first/manifest.json': json({ id: 'duplicate-source', version: '1.0.0' }),
    'plugins/second/package.json': json({ name: '@fixture/second', version: '1.0.0' }),
    'plugins/second/manifest.json': json({ id: 'duplicate-source', version: '1.0.0' })
  });
  try {
    const { discoverSourcePluginWorkspaces } =
      await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
    await assert.rejects(
      () => discoverSourcePluginWorkspaces(root),
      /duplicate source plugin artifact: duplicate-source@1\.0\.0/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid manifest ids, versions, and workspace package names', async () => {
  const fixtures = [
    {
      files: {
        'plugins/invalid-id/package.json': json({ name: '@fixture/invalid-id', version: '1.0.0' }),
        'plugins/invalid-id/manifest.json': json({ id: 'Invalid ID', version: '1.0.0' })
      },
      error: /invalid-id.*manifest id is invalid/i
    },
    {
      files: {
        'plugins/invalid-version/package.json': json({
          name: '@fixture/invalid-version',
          version: 'latest'
        }),
        'plugins/invalid-version/manifest.json': json({
          id: 'invalid-version',
          version: 'latest'
        })
      },
      error: /invalid-version.*manifest version is invalid/i
    },
    {
      files: {
        'plugins/missing-name/package.json': json({ version: '1.0.0' }),
        'plugins/missing-name/manifest.json': json({ id: 'missing-name', version: '1.0.0' })
      },
      error: /missing-name.*package name is invalid/i
    }
  ];

  const { discoverSourcePluginWorkspaces } =
    await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
  for (const fixture of fixtures) {
    const root = await createFixture(fixture.files);
    try {
      await assert.rejects(() => discoverSourcePluginWorkspaces(root), fixture.error);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
