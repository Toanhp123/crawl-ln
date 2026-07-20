import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test('clean removes only generated artifacts and is idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-clean-'));
  try {
    const generated = [
      'packages/shared/dist/index.js',
      'apps/api/dist/main.js',
      'apps/web/dist/index.html',
      'coverage/lcov.info',
      'playwright-report/index.html',
      'test-results/result.json',
      '.nyc_output/out.json',
      'apps/api/tsconfig.tsbuildinfo',
      'packages/shared/cache/custom.tsbuildinfo',
    ];
    const protectedPaths = [
      '.env',
      'package-lock.json',
      'storage/novel-tool.sqlite',
      'plugins/example/manifest.json',
      'apps/api/src/main.ts',
    ];

    for (const path of [...generated, ...protectedPaths]) {
      const absolute = join(root, path);
      await mkdir(join(absolute, '..'), { recursive: true });
      await writeFile(absolute, path);
    }

    const { cleanGeneratedArtifacts } = await import('../../scripts/clean.mjs');
    const first = await cleanGeneratedArtifacts(root);
    const second = await cleanGeneratedArtifacts(root);

    for (const path of generated) assert.equal(await exists(join(root, path)), false, path);
    for (const path of protectedPaths) {
      assert.equal(await readFile(join(root, path), 'utf8'), path, path);
    }
    assert.ok(first.removed.length >= 7);
    assert.deepEqual(second.removed, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
