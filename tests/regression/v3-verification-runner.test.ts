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
      'check:arch',
      'check:web-arch',
      'check:web-contracts',
      'check:reader-engine-arch',
      'check:types',
      'build',
      'contract',
      'regression',
      'integration',
      'e2e'
    ]
  );
});

test('v3 build resolves Vite from the canonical web workspace', async () => {
  const { verificationSteps } = await import('../../scripts/verify-v3.mjs');
  const build = verificationSteps.find((step: { name: string }) => step.name === 'build') as {
    commands: Array<{ name: string; args: string[] }>;
  };
  const webBuild = build.commands.find((step) => step.name === 'build:web');

  assert.equal(webBuild?.args[0], resolve('apps/web/node_modules/vite/bin/vite.js'));
});

test('v3 verification and final release evidence are exposed through npm and CI', async () => {
  const [packageSource, workflow] = await Promise.all([
    readFile('package.json', 'utf8'),
    readFile('.github/workflows/ci.yml', 'utf8')
  ]);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts['verify:v3'], 'node scripts/verify-v3.mjs');
  assert.equal(packageJson.scripts.verify, 'node scripts/verify.mjs');
  assert.equal(
    packageJson.scripts['verify:release:v3'],
    'npm run verify && npm run test:e2e && npm run rehearse:v3:cutover && node scripts/v3/release-evidence.mjs'
  );
  assert.match(workflow, /^\s*- run: npm run verify:release\s*$/m);
  assert.doesNotMatch(workflow, /npm run verify:release:v3/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});
