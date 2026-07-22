import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webPackageUrl = new URL('../../apps/web-legacy/package.json', import.meta.url);

test('web scripts invoke Vite through Node for Termux compatibility', async () => {
  const packageJson = JSON.parse(await readFile(webPackageUrl, 'utf8')) as {
    scripts: Record<string, string>;
  };

  for (const scriptName of ['dev', 'build', 'preview']) {
    const script = packageJson.scripts[scriptName];
    assert.match(script, /node \.\.\/\.\.\/node_modules\/vite\/bin\/vite\.js/);
    assert.doesNotMatch(script, /(?:^|&&|;)\s*vite(?:\s|$)/);
  }
});

const rootPackageUrl = new URL('../../package.json', import.meta.url);

test('root exposes only the canonical Termux development alias', async () => {
  const packageJson = JSON.parse(await readFile(rootPackageUrl, 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts.termux, undefined);
  assert.equal(packageJson.scripts['dev:termux'], 'sh scripts/termux-dev.sh');
});

const setupTermuxUrl = new URL('../../scripts/setup-termux.sh', import.meta.url);
const termuxDevUrl = new URL('../../scripts/termux-dev.sh', import.meta.url);

test('Termux setup is reproducible and repeated dev startup skips redundant installs', async () => {
  const [setup, dev] = await Promise.all([
    readFile(setupTermuxUrl, 'utf8'),
    readFile(termuxDevUrl, 'utf8')
  ]);

  assert.match(setup, /npm ci --registry=https:\/\/registry\.npmjs\.org\//);
  assert.doesNotMatch(setup, /npm install/);
  assert.match(dev, /if \[ ! -d node_modules \]/);
  assert.match(dev, /npm ci --registry=https:\/\/registry\.npmjs\.org\//);
  assert.doesNotMatch(dev, /Installing\/updating dependencies/);
});
