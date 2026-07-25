import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function createRuntimePackage(root: string, name: string): Promise<void> {
  await mkdir(join(root, 'server/node_modules', ...name.split('/'), 'dist'), {
    recursive: true
  });
  await writeFile(
    join(root, 'server/node_modules', ...name.split('/'), 'package.json'),
    JSON.stringify({ name, type: 'module', main: 'dist/index.js' })
  );
  await writeFile(
    join(root, 'server/node_modules', ...name.split('/'), 'dist/index.js'),
    'export {};'
  );
}

test('manifest accepts only a complete current-version build with safe relative paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-manifest-'));
  try {
    await mkdir(join(root, 'server'), { recursive: true });
    await mkdir(join(root, 'public'), { recursive: true });
    await writeFile(join(root, 'server/server.js'), 'export const startServer = () => {};');
    await writeFile(join(root, 'public/index.html'), '<div id="root"></div>');
    await writeFile(join(root, 'backup-control.sqlite'), 'private runtime state');
    await mkdir(join(root, 'backup-temp'));
    await createRuntimePackage(root, '@novel-tool/shared');
    await createRuntimePackage(root, '@novel-tool/source-plugin-sdk');
    const { writeBuildManifest, readStartableBuild } =
      await import('../../scripts/cli/lib/build-manifest.mjs');
    await writeBuildManifest(root, {
      formatVersion: 1,
      applicationVersion: '3.0.0',
      buildId: 'test-build',
      complete: true,
      serverEntry: 'server/server.js',
      publicDirectory: 'public',
      runtimePackages: {
        '@novel-tool/shared': 'server/node_modules/@novel-tool/shared',
        '@novel-tool/source-plugin-sdk': 'server/node_modules/@novel-tool/source-plugin-sdk'
      }
    });
    assert.equal((await readStartableBuild(root, '3.0.0')).manifest.complete, true);
    await assert.rejects(() => readStartableBuild(root, '4.0.0'), /application version 4\.0\.0/);
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    assert.doesNotMatch(JSON.stringify(manifest), /backup-control\.sqlite|backup-temp/);
    manifest.serverEntry = '../escape.js';
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(() => readStartableBuild(root, '3.0.0'), /safe relative path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed promotion restores the previous target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-atomic-'));
  try {
    const target = join(root, 'dist');
    const stage = join(root, '.dist-stage');
    await mkdir(target);
    await mkdir(stage);
    await writeFile(join(target, 'known-good'), 'old');
    await writeFile(join(stage, 'candidate'), 'new');
    const { promoteDirectory } = await import('../../scripts/cli/lib/atomic-directory.mjs');
    await assert.rejects(
      () =>
        promoteDirectory({
          target,
          stage,
          beforePromote: () => {
            throw new Error('injected promotion failure');
          }
        }),
      /injected promotion failure/
    );
    assert.equal(await readFile(join(target, 'known-good'), 'utf8'), 'old');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
