import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('start rejects a partial build before importing server code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-start-'));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        formatVersion: 1,
        applicationVersion: '3.0.0',
        buildId: 'partial',
        complete: false,
        serverEntry: 'server/server.js',
        publicDirectory: 'public',
        runtimePackages: {}
      })
    );
    const { startBuiltApplication } = await import('../../scripts/cli/commands/start.mjs');
    let imported = false;
    await assert.rejects(
      () =>
        startBuiltApplication({
          distRoot: root,
          applicationVersion: '3.0.0',
          importServer: async () => {
            imported = true;
            return {} as never;
          }
        }),
      /complete/
    );
    assert.equal(imported, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('start imports the validated server in-process, passes public assets, and closes on abort', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-start-complete-'));
  const controller = new AbortController();
  try {
    await mkdir(join(root, 'server/node_modules/@novel-tool/shared/dist'), { recursive: true });
    await mkdir(join(root, 'server/node_modules/@novel-tool/source-plugin-sdk/dist'), {
      recursive: true
    });
    await mkdir(join(root, 'public'), { recursive: true });
    await writeFile(join(root, 'public/index.html'), '<div id="root"></div>');
    for (const name of ['shared', 'source-plugin-sdk']) {
      const packageRoot = join(root, 'server/node_modules/@novel-tool', name);
      await writeFile(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name: `@novel-tool/${name}`, type: 'module', main: 'dist/index.js' })
      );
      await writeFile(join(packageRoot, 'dist/index.js'), 'export {};');
    }
    await writeFile(
      join(root, 'server/server.js'),
      `export async function startServer(options) {
        globalThis.__novelToolStartOptions = options;
        return {
          url: 'http://127.0.0.1:43123',
          async close() { globalThis.__novelToolCloseCount = (globalThis.__novelToolCloseCount ?? 0) + 1; }
        };
      }`
    );
    const { writeBuildManifest } = await import('../../scripts/cli/lib/build-manifest.mjs');
    await writeBuildManifest(root, {
      formatVersion: 1,
      applicationVersion: '3.0.0',
      buildId: 'start-test',
      complete: true,
      serverEntry: 'server/server.js',
      publicDirectory: 'public',
      runtimePackages: {
        '@novel-tool/shared': 'server/node_modules/@novel-tool/shared',
        '@novel-tool/source-plugin-sdk': 'server/node_modules/@novel-tool/source-plugin-sdk'
      }
    });
    const { startBuiltApplication } = await import('../../scripts/cli/commands/start.mjs');
    const lines: string[] = [];
    const started = startBuiltApplication({
      distRoot: root,
      applicationVersion: '3.0.0',
      signal: controller.signal,
      stdout: (line: string) => lines.push(line)
    });
    while (lines.length === 0) await new Promise((resolveWait) => setTimeout(resolveWait, 1));
    controller.abort();
    await assert.rejects(started, (error: { exitCode?: number }) => error.exitCode === 130);
    assert.deepEqual(
      (globalThis as typeof globalThis & { __novelToolStartOptions?: unknown })
        .__novelToolStartOptions,
      { publicDirectory: join(root, 'public') }
    );
    assert.equal(
      (globalThis as typeof globalThis & { __novelToolCloseCount?: number }).__novelToolCloseCount,
      1
    );
    assert.match(lines.join('\n'), /http:\/\/127\.0\.0\.1:43123/);
  } finally {
    delete (globalThis as typeof globalThis & { __novelToolStartOptions?: unknown })
      .__novelToolStartOptions;
    delete (globalThis as typeof globalThis & { __novelToolCloseCount?: number })
      .__novelToolCloseCount;
    await rm(root, { recursive: true, force: true });
  }
});

test('web API defaults to same-origin paths', async () => {
  const { API_BASE_URL } = await import('../../apps/web/src/shared/config/api.ts');
  assert.equal(API_BASE_URL, '');
});
