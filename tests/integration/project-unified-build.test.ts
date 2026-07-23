import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readStartableBuild } from '../../scripts/cli/lib/build-manifest.mjs';
import { buildFullApplication } from '../../scripts/cli/commands/build.mjs';

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
  await buildFullApplication({
    distRoot,
    buildId: 'integration-build',
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
        buildWeb: async () => {
          throw new Error('injected web build failure');
        }
      }),
    /injected web build failure/
  );
  assert.equal(await readFile(join(distRoot, 'known-good'), 'utf8'), 'old');
});
