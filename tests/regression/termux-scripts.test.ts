import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webPackageUrl = new URL('../../apps/web/package.json', import.meta.url);

test('web scripts invoke Vite through Node for Termux compatibility', async () => {
  const packageJson = JSON.parse(await readFile(webPackageUrl, 'utf8')) as {
    scripts: Record<string, string>;
  };

  for (const scriptName of ['dev', 'build', 'preview']) {
    const script = packageJson.scripts[scriptName];
    assert.match(script, /node \.\/node_modules\/vite\/bin\/vite\.js/);
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
