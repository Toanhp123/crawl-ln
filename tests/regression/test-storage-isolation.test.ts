import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runTestFile } from '../../scripts/cli/lib/test-runner.mjs';

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('test file receives isolated runtime paths that are removed after natural exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-runner-contract-'));
  const testFile = join(root, 'fixture.test.ts');
  const marker = join(root, 'marker.json');
  await writeFile(
    testFile,
    `import test from 'node:test';\nimport { mkdir, writeFile } from 'node:fs/promises';\n` +
      `test('records isolated paths', async () => {\n` +
      `  await mkdir(process.env.STORAGE_DIR!, { recursive: true });\n` +
      `  await writeFile(process.env.TEST_MARKER!, JSON.stringify({ storage: process.env.STORAGE_DIR, plugins: process.env.SOURCE_READER_PLUGIN_DIR }));\n` +
      `});\n`
  );
  try {
    await runTestFile({
      suiteName: 'regression',
      file: testFile,
      baseEnv: { ...process.env, TEST_MARKER: marker },
      timeoutMs: 15_000
    });
    const paths = JSON.parse(await readFile(marker, 'utf8')) as {
      storage: string;
      plugins: string;
    };
    assert.notEqual(paths.storage, join(process.cwd(), 'storage'));
    assert.equal(await exists(paths.storage), false);
    assert.equal(await exists(paths.plugins), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
