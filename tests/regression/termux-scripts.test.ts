import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('canonical web scripts invoke Vite through Node for Termux compatibility', async () => {
  const packageJson = JSON.parse(await readFile('apps/web/package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts.dev, 'node node_modules/vite/bin/vite.js --host 0.0.0.0');
  assert.equal(
    packageJson.scripts.build,
    'tsc -p tsconfig.json && node node_modules/vite/bin/vite.js build'
  );
  assert.equal(
    packageJson.scripts.preview,
    'node node_modules/vite/bin/vite.js preview --host 0.0.0.0'
  );
});

test('root exposes only the canonical Termux development alias', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.scripts.termux, undefined);
  assert.equal(packageJson.scripts['setup:termux'], 'sh scripts/setup-termux.sh');
  assert.equal(packageJson.scripts['dev:termux'], 'sh scripts/termux-dev.sh');
});

test('Termux scripts use canonical storage, env and reproducible startup', async () => {
  const [setup, dev] = await Promise.all([
    readFile('scripts/setup-termux.sh', 'utf8'),
    readFile('scripts/termux-dev.sh', 'utf8')
  ]);
  const source = `${setup}\n${dev}`;
  assert.match(source, /apps\/api\/storage/);
  assert.match(source, /apps\/api\/\.env(?:\.termux)?\.example/);
  assert.doesNotMatch(source, /api-next|web-next|api-legacy|web-legacy/);
  assert.match(source, /npm ci --registry=https:\/\/registry\.npmjs\.org\//g);
  assert.match(dev, /if \[ ! -d node_modules \]/);
  assert.doesNotMatch(dev, /Installing\/updating dependencies/);
});
