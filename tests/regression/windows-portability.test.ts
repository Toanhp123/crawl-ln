import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiPackage = JSON.parse(
  await readFile(new URL('../../apps/api-legacy/package.json', import.meta.url), 'utf8')
) as { scripts: Record<string, string> };
const webPackage = JSON.parse(
  await readFile(new URL('../../apps/web-legacy/package.json', import.meta.url), 'utf8')
) as { scripts: Record<string, string> };

test('API lifecycle scripts avoid POSIX-only environment assignment', () => {
  for (const scriptName of ['dev', 'build', 'start', 'check']) {
    assert.doesNotMatch(apiPackage.scripts[scriptName], /\bNODE_OPTIONS=/);
  }

  assert.match(
    apiPackage.scripts.dev,
    /^node --experimental-sqlite --watch --import tsx src\/main\.ts$/
  );
});

test('database reset is cross-platform', () => {
  assert.equal(apiPackage.scripts['db:reset'], 'node scripts/reset-db.mjs');
  assert.doesNotMatch(apiPackage.scripts['db:reset'], /\brm\s+-f\b/);
});

test('API build uses a Node script instead of POSIX mkdir and cp', async () => {
  assert.equal(apiPackage.scripts.build, 'node scripts/build.mjs');
  const source = await readFile(
    new URL('../../apps/api-legacy/scripts/build.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /copyFile/);
  assert.match(source, /mkdir/);
  assert.doesNotMatch(source, /mkdir -p|\bcp\s/);
});

test('legacy Web lifecycle scripts resolve the hoisted Vite binary through Node', () => {
  assert.equal(webPackage.scripts.dev, 'node ../../node_modules/vite/bin/vite.js --host 0.0.0.0');
  assert.equal(
    webPackage.scripts.build,
    'tsc -p tsconfig.json && node ../../node_modules/vite/bin/vite.js build'
  );
  assert.equal(
    webPackage.scripts.preview,
    'node ../../node_modules/vite/bin/vite.js preview --host 0.0.0.0'
  );

  for (const scriptName of ['dev', 'build', 'preview']) {
    assert.match(webPackage.scripts[scriptName], /node \.\.\/\.\.\/node_modules\/vite/);
  }
});
