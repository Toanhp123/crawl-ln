import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('test runner discovers only sorted test files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-test-runner-'));
  try {
    await mkdir(join(root, 'suite'), { recursive: true });
    await Promise.all([
      writeFile(join(root, 'suite', 'b.test.ts'), ''),
      writeFile(join(root, 'suite', 'a.test.ts'), ''),
      writeFile(join(root, 'suite', 'helper.ts'), '')
    ]);

    const { collectTestFiles, chunkTestFiles, createTestBatches } =
      await import('../../scripts/run-test-files.mjs');
    const files = await collectTestFiles(join(root, 'suite'));
    assert.deepEqual(files, [join(root, 'suite', 'a.test.ts'), join(root, 'suite', 'b.test.ts')]);
    assert.deepEqual(chunkTestFiles(files, 1), [[files[0]], [files[1]]]);
    assert.deepEqual(createTestBatches(files, 2, new Set(['b.test.ts'])), [[files[0]], [files[1]]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
