import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('test runner discovers only sorted test files and forbids shared-process escape hatches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-test-runner-'));
  try {
    await mkdir(join(root, 'suite'), { recursive: true });
    await Promise.all([
      writeFile(join(root, 'suite', 'b.test.ts'), ''),
      writeFile(join(root, 'suite', 'a.test.ts'), ''),
      writeFile(join(root, 'suite', 'helper.ts'), '')
    ]);

    const { collectTestFiles } = await import('../../scripts/cli/lib/test-runner.mjs');
    const files = await collectTestFiles(join(root, 'suite'));
    assert.deepEqual(files, [join(root, 'suite', 'a.test.ts'), join(root, 'suite', 'b.test.ts')]);

    const runnerSource = await readFile('scripts/cli/lib/test-runner.mjs', 'utf8');
    assert.equal(runnerSource.includes('--experimental-test-isolation=none'), false);
    assert.equal(runnerSource.includes('--test-force-exit'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('test runner summarizes isolated TAP results without streaming successful child output', async () => {
  const { parseTestSummary } = await import('../../scripts/cli/lib/test-runner.mjs');
  assert.deepEqual(
    parseTestSummary(
      `# tests 4\n# suites 1\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n`
    ),
    { tests: 4, pass: 3, fail: 0, skipped: 1 }
  );

  const runnerSource = await readFile('scripts/cli/lib/test-runner.mjs', 'utf8');
  assert.equal(runnerSource.includes("stdio: 'inherit'"), false);
});

test('canonical regression files use the regular isolated runner partition', async () => {
  const { partitionTestFiles } = await import('../../scripts/cli/lib/test-runner.mjs');
  const files = [
    '/repo/tests/regression/a.test.ts',
    '/repo/tests/regression/source-reader-external-process-sandbox.test.ts',
    '/repo/tests/regression/source-reader-external-context-parity.test.ts'
  ];
  assert.deepEqual(partitionTestFiles('regression', files), {
    regular: [...files].sort((left, right) => left.localeCompare(right)),
    exclusive: []
  });
});

test('web regression files use the web tsconfig for the automatic JSX runtime', async () => {
  const { tsxTsconfigPath } = await import('../../scripts/cli/lib/test-runner.mjs');
  assert.equal(
    tsxTsconfigPath('regression', 'C:/repo/tests/regression/web-segmented-control.test.ts'),
    join(process.cwd(), 'apps', 'web', 'tsconfig.json')
  );
  assert.equal(
    tsxTsconfigPath('regression', 'C:/repo/tests/regression/project-test-runner.test.ts'),
    undefined
  );
  assert.equal(
    tsxTsconfigPath('integration', 'C:/repo/tests/integration/web-example.test.ts'),
    undefined
  );
});

