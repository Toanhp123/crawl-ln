import assert from 'node:assert/strict';
import { homedir, tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import test from 'node:test';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test('clean removes generated artifacts but preserves data and environment files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-clean-'));
  try {
    const generated = [
      'dist/manifest.json',
      'packages/shared/dist/index.js',
      'apps/api/dist/main.js',
      'apps/web/dist/index.html',
      'coverage/lcov.info',
      'playwright-report/index.html',
      'test-results/result.json',
      '.nyc_output/out.json',
      'apps/api/tsconfig.tsbuildinfo'
    ];
    const protectedPaths = [
      '.env',
      'apps/api/.env',
      'apps/api/storage/novel-tool.sqlite',
      'apps/api/storage/source-plugins/example/manifest.json',
      'apps/api/src/main.ts'
    ];
    for (const path of [...generated, ...protectedPaths]) {
      const absolute = join(root, path);
      await mkdir(join(absolute, '..'), { recursive: true });
      await writeFile(absolute, path);
    }
    const { cleanGeneratedArtifacts } = await import('../../scripts/cli/commands/clean.mjs');
    const first = await cleanGeneratedArtifacts({ projectRoot: root });
    const second = await cleanGeneratedArtifacts({ projectRoot: root });
    for (const path of generated) assert.equal(await exists(join(root, path)), false, path);
    for (const path of protectedPaths) assert.equal(await readFile(join(root, path), 'utf8'), path);
    assert.ok(first.removed.length >= 7);
    assert.deepEqual(second.removed, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('clean deletion guard rejects repository, roots, home, and escapes', async () => {
  const { isSafeDeletionTarget } = await import('../../scripts/cli/commands/clean.mjs');
  assert.equal(isSafeDeletionTarget('/repo', '/repo/dist', posix, '/home/me'), true);
  assert.equal(isSafeDeletionTarget('/repo', '/repo', posix, '/home/me'), false);
  assert.equal(isSafeDeletionTarget('/repo', '/', posix, '/home/me'), false);
  assert.equal(isSafeDeletionTarget('/repo', '/home/me', posix, '/home/me'), false);
  assert.equal(isSafeDeletionTarget('C:\\repo', 'C:\\repo\\dist', win32, 'C:\\Users\\me'), true);
  assert.equal(isSafeDeletionTarget('C:\\repo', 'C:\\repo', win32, 'C:\\Users\\me'), false);
  assert.equal(isSafeDeletionTarget('C:\\repo', 'C:\\', win32, 'C:\\Users\\me'), false);
});

test('data reset refuses unmarked custom storage and deletes marked storage with yes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-clean-data-'));
  const external = await mkdtemp(join(tmpdir(), 'novel-tool-clean-external-'));
  try {
    const apiRoot = join(root, 'apps', 'api');
    await mkdir(apiRoot, { recursive: true });
    await writeFile(join(apiRoot, '.env'), `STORAGE_DIR=${external}\n`);
    await writeFile(join(external, 'user-file'), 'keep');
    const { cleanDevelopmentData } = await import('../../scripts/cli/commands/clean.mjs');
    await assert.rejects(
      () =>
        cleanDevelopmentData({
          projectRoot: root,
          environment: {},
          yes: true,
          homeDirectory: homedir()
        }),
      /unmarked|marker/i
    );
    await writeFile(
      join(external, '.novel-tool-runtime.json'),
      JSON.stringify({ formatVersion: 1, instanceId: '11111111-1111-4111-8111-111111111111' })
    );
    const result = await cleanDevelopmentData({
      projectRoot: root,
      environment: {},
      yes: true,
      homeDirectory: homedir()
    });
    assert.equal(result.removed.includes(external), true);
    assert.equal(await exists(external), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});
