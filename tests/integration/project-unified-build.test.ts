import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';
import { readStartableBuild } from '../../scripts/cli/lib/build-manifest.mjs';
import { buildFullApplication } from '../../scripts/cli/commands/build.mjs';
import { packageFirstPartySourcePlugin } from '../../scripts/cli/lib/first-party-source-plugin.mjs';

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

test('unified build stages server, runtime packages, public assets, and a complete manifest', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-unified-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distRoot = join(root, 'dist');
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  await buildFullApplication({
    distRoot,
    buildId: 'integration-build',
    packageFirstPartyPlugins: async ({ root: projectRoot, outputDirectory }) =>
      packageFirstPartySourcePlugin({
        root: projectRoot,
        workspaceRoot: join(projectRoot, 'plugins', 'novelcool'),
        outputDirectory,
        verifier
      }),
    buildWeb: async ({ outDir }) => {
      await mkdir(join(outDir, 'assets'), { recursive: true });
      await writeFile(join(outDir, 'index.html'), '<!doctype html><div id=\"root\"></div>');
      await writeFile(join(outDir, 'assets/app.js'), 'console.log(\"app\")');
    }
  });
  const built = await readStartableBuild(distRoot, '3.0.0');
  assert.equal(built.manifest.complete, true);
  assert.equal(await exists(built.serverEntry), true);
  assert.equal(await exists(join(built.publicDirectory, 'index.html')), true);
  assert.equal(await exists(join(distRoot, 'plugins', 'novelcool-2.0.0.source-plugin')), true);
  assert.equal(
    await exists(
      join(
        distRoot,
        'server/modules/source-reader/infrastructure/runtime/external-process/sandbox-entry.mjs'
      )
    ),
    true
  );
  assert.deepEqual(Object.keys(built.runtimePackages).sort(), [
    '@novel-tool/shared',
    '@novel-tool/source-plugin-sdk'
  ]);
  const manifestText = await readFile(join(distRoot, 'manifest.json'), 'utf8');
  assert.doesNotMatch(manifestText, /apps[/\\].*[/\\]dist|packages[/\\].*[/\\]dist/);
});

test('failed web build preserves a previous valid dist', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-unified-build-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distRoot = join(root, 'dist');
  await mkdir(distRoot, { recursive: true });
  await writeFile(join(distRoot, 'known-good'), 'old');
  await assert.rejects(
    () =>
      buildFullApplication({
        distRoot,
        buildId: 'failed-build',
        packageFirstPartyPlugins: async () => undefined,
        buildWeb: async () => {
          throw new Error('injected web build failure');
        }
      }),
    /injected web build failure/
  );
  assert.equal(await readFile(join(distRoot, 'known-good'), 'utf8'), 'old');
});

test('failed plugin packaging preserves a previous valid dist', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-unified-plugin-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distRoot = join(root, 'dist');
  await mkdir(distRoot, { recursive: true });
  await writeFile(join(distRoot, 'known-good'), 'old');

  await assert.rejects(
    () =>
      buildFullApplication({
        distRoot,
        buildId: 'failed-plugin-build',
        packageFirstPartyPlugins: async () => {
          throw new Error('plugin verify failed');
        },
        buildWeb: async ({ outDir }) => {
          await mkdir(outDir, { recursive: true });
          await writeFile(join(outDir, 'index.html'), '<div id="root"></div>');
        }
      }),
    /plugin verify failed/
  );
  assert.equal(await readFile(join(distRoot, 'known-good'), 'utf8'), 'old');
});
