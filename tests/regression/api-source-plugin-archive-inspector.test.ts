import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import JSZip from 'jszip';
import { SourcePluginArchiveInspector } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/archive/source-plugin-archive.inspector.ts';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';

function manifest(id = 'fixture-plugin', permissionHosts = ['fixture.example']) {
  return {
    id,
    name: 'Fixture Plugin',
    version: '1.2.3',
    engines: { sourceReader: '^1.0.0' },
    capabilities: ['identify', 'metadata'],
    contracts: { identify: 1, metadata: 1 },
    matchers: [{ hosts: ['fixture.example'], include: ['/**'], priority: 100 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: permissionHosts } }
  };
}

async function archive(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content, { unixPermissions: 0o100644, createFolders: false });
  }
  return zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 }
  });
}

function sourceFiles(prefix = ''): Record<string, string> {
  return {
    [`${prefix}manifest.json`]: JSON.stringify(manifest()),
    [`${prefix}src/index.ts`]: 'export default {}',
    [`${prefix}tests/smoke.test.ts`]: 'export {}'
  };
}

async function builtPackage(): Promise<Uint8Array> {
  const packageFiles = {
    'manifest.json': JSON.stringify(manifest('built-fixture')),
    'dist/index.js': 'export default {}'
  };
  const checksums = Object.fromEntries(
    Object.entries(packageFiles).map(([path, content]) => [
      path,
      createHash('sha256').update(content).digest('hex')
    ])
  );
  return archive({ ...packageFiles, 'checksums.json': JSON.stringify(checksums) });
}

function inspector() {
  return new SourcePluginArchiveInspector(
    new SourcePluginPackageVerifier(new StaticTrustStore([]))
  );
}

test('archive inspector recognizes a verified built package by contents', async () => {
  const bytes = await builtPackage();
  const inspected = await inspector().inspect({ bytes, originalName: 'plugin.zip' });

  assert.equal(inspected.preview.kind, 'built-package');
  assert.equal(inspected.preview.pluginId, 'built-fixture');
  assert.equal(inspected.preview.checksum, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(inspected.preview.hosts, ['fixture.example']);
  assert.ok(inspected.artifact);
  assert.equal(inspected.artifact.fileName, 'built-fixture-1.2.3.source-plugin');
  assert.equal(inspected.source, undefined);
});

test('archive inspector recognizes Studio source independently of the file extension', async () => {
  const inspected = await inspector().inspect({
    bytes: await archive(sourceFiles()),
    originalName: 'plugin.not-a-zip'
  });

  assert.equal(inspected.preview.kind, 'studio-source');
  assert.equal(inspected.preview.pluginId, 'fixture-plugin');
  assert.deepEqual(inspected.preview.files, [
    'manifest.json',
    'src/index.ts',
    'tests/smoke.test.ts'
  ]);
  assert.deepEqual(inspected.preview.ignoredFiles, []);
  assert.deepEqual(inspected.source?.selectors, {});
  assert.deepEqual(inspected.source?.files, sourceFiles());
  assert.equal(inspected.artifact, undefined);
});

test('archive inspector normalizes exactly one wrapper directory', async () => {
  const inspected = await inspector().inspect({
    bytes: await archive({
      ...sourceFiles('fixture-main/'),
      'fixture-main/README.md': 'Documentation'
    }),
    originalName: 'fixture-main.zip'
  });

  assert.equal(inspected.preview.kind, 'studio-source');
  assert.deepEqual(inspected.preview.files, [
    'manifest.json',
    'src/index.ts',
    'tests/smoke.test.ts'
  ]);
  assert.deepEqual(inspected.preview.ignoredFiles, ['README.md']);
  assert.ok(inspected.source?.files['src/index.ts']);
  assert.equal(inspected.source?.files['fixture-main/src/index.ts'], undefined);
});

test('archive inspector recognizes npm workspaces but imports only Studio files', async () => {
  const inspected = await inspector().inspect({
    bytes: await archive({
      ...sourceFiles(),
      'package.json': JSON.stringify({ name: 'fixture-workspace', scripts: { build: 'unsafe' } }),
      'README.md': 'Documentation',
      'scripts/postinstall.js': 'throw new Error("must not run")'
    }),
    originalName: 'workspace.zip'
  });

  assert.equal(inspected.preview.kind, 'npm-workspace');
  assert.deepEqual(inspected.preview.ignoredFiles, [
    'README.md',
    'package.json',
    'scripts/postinstall.js'
  ]);
  assert.deepEqual(Object.keys(inspected.source?.files ?? {}).sort(), [
    'manifest.json',
    'src/index.ts',
    'tests/smoke.test.ts'
  ]);
});

test('archive inspector keeps wildcard network permissions out of Studio project hosts', async () => {
  const sourceManifest = manifest('wildcard-fixture', ['fixture.example', '*.fixture.example']);
  const inspected = await inspector().inspect({
    bytes: await archive({
      'manifest.json': JSON.stringify(sourceManifest),
      'src/index.ts': 'export default {}'
    }),
    originalName: 'wildcard-fixture.zip'
  });

  assert.deepEqual(inspected.preview.hosts, ['fixture.example', '*.fixture.example']);
  assert.deepEqual(inspected.source?.hosts, ['fixture.example']);
});

test('archive inspector rejects multiple candidate plugin roots', async () => {
  await assert.rejects(
    async () =>
      inspector().inspect({
        bytes: await archive({ ...sourceFiles('one/'), ...sourceFiles('two/') }),
        originalName: 'ambiguous.zip'
      }),
    /multiple plugin roots|ambiguous/i
  );
});

test('archive inspector rejects unsupported npm workspaces', async () => {
  await assert.rejects(
    async () =>
      inspector().inspect({
        bytes: await archive({
          'package.json': JSON.stringify({ name: 'ordinary-app' }),
          'src/index.ts': 'console.log("not a plugin")'
        }),
        originalName: 'ordinary-app.zip'
      }),
    /unsupported/i
  );
});
