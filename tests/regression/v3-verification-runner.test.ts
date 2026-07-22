import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('v3 verification covers every cutover acceptance surface in order', async () => {
  const { verificationSteps } = await import('../../scripts/verify-v3.mjs');

  assert.deepEqual(
    verificationSteps.map((step: { name: string }) => step.name),
    [
      'check:lockfile',
      'prepare:packages',
      'check:docs',
      'check:current-reference',
      'build:current-reference',
      'check:api-next-arch',
      'check:web-next-arch',
      'check:web-next-contracts',
      'check:reader-engine-arch',
      'check:next-types',
      'build:next',
      'contract',
      'regression',
      'integration',
      'e2e:web-next'
    ]
  );
});

test('v3 next build resolves Vite from the web-next workspace', async () => {
  const { verificationSteps } = await import('../../scripts/verify-v3.mjs');
  const buildNext = verificationSteps.find(
    (step: { name: string }) => step.name === 'build:next'
  ) as { commands: Array<{ name: string; args: string[] }> };
  const webBuild = buildNext.commands.find((step) => step.name === 'build:web-next');

  assert.equal(webBuild?.args[0], resolve('apps/web-next/node_modules/vite/bin/vite.js'));
});

test('v3 verification is exposed through npm and CI without replacing the legacy gate', async () => {
  const [packageSource, workflow] = await Promise.all([
    readFile('package.json', 'utf8'),
    readFile('.github/workflows/ci.yml', 'utf8')
  ]);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts['verify:v3'], 'node scripts/verify-v3.mjs');
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
  assert.match(workflow, /npm run verify:v3/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});
