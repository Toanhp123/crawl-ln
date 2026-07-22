import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type PackageJson = {
  scripts: Record<string, string>;
};

async function readPackage(path: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
  ) as PackageJson;
}

test('root build prepares shared and SDK once while workspace builds remain local', async () => {
  const [root, api, web] = await Promise.all([
    readPackage('package.json'),
    readPackage('apps/api-legacy/package.json'),
    readPackage('apps/web-legacy/package.json')
  ]);

  assert.equal(root.scripts.build, 'npm run prepare:packages && npm run build:prepared');
  assert.equal(root.scripts['prepare:packages'], 'node scripts/prepare-packages.mjs');
  assert.equal(root.scripts['build:shared'], 'node scripts/prepare-shared.mjs');
  assert.equal(root.scripts['build:sdk'], 'node scripts/prepare-sdk.mjs');
  assert.equal(root.scripts['build:prepared'], 'node scripts/build-prepared.mjs');
  assert.equal(
    root.scripts['build:api'],
    'npm run prepare:packages && npm run build -w @novel-tool/api-legacy'
  );
  assert.equal(
    root.scripts['build:web'],
    'npm run prepare:packages && npm run build -w @novel-tool/web-legacy'
  );

  assert.equal(api.scripts.build, 'node scripts/build.mjs');

  for (const workspace of [api, web]) {
    assert.doesNotMatch(workspace.scripts.build, /build(?::shared)?\s+-w\s+@novel-tool\/shared/);
    assert.doesNotMatch(workspace.scripts.build, /cd \.\.\/\.\./);
  }
});

test('root check prepares shared and SDK once while workspace checks remain local', async () => {
  const [root, api, web] = await Promise.all([
    readPackage('package.json'),
    readPackage('apps/api-legacy/package.json'),
    readPackage('apps/web-legacy/package.json')
  ]);

  assert.equal(root.scripts.check, 'npm run prepare:packages && npm run check:prepared');
  assert.equal(root.scripts['prepare:shared'], 'node scripts/prepare-shared.mjs');
  assert.equal(root.scripts['prepare:sdk'], 'node scripts/prepare-sdk.mjs');
  assert.equal(root.scripts['check:prepared'], 'node scripts/check-prepared.mjs');
  assert.equal(
    root.scripts['check:api'],
    'npm run prepare:packages && npm run check -w @novel-tool/api-legacy'
  );
  assert.equal(
    root.scripts['check:web'],
    'npm run prepare:packages && npm run check -w @novel-tool/web-legacy'
  );

  assert.equal(api.scripts.build, 'node scripts/build.mjs');

  for (const workspace of [api, web]) {
    assert.doesNotMatch(workspace.scripts.check, /check\s+-w\s+@novel-tool\/shared/);
    assert.doesNotMatch(workspace.scripts.check, /cd \.\.\/\.\./);
  }
});

test('verify reuses prepared integration output and maintenance commands are canonical', async () => {
  const root = await readPackage('package.json');

  assert.equal(root.scripts.verify, 'node scripts/verify.mjs');
  assert.equal(
    root.scripts['test:regression'],
    'npm run prepare:packages && npm run test:regression:prepared'
  );
  assert.equal(
    root.scripts['test:regression:prepared'],
    'node scripts/run-test-files.mjs regression'
  );
  assert.equal(
    root.scripts['test:integration'],
    'npm run prepare:packages && npm run test:integration:prepared'
  );
  assert.equal(
    root.scripts['test:integration:prepared'],
    'node scripts/run-test-files.mjs integration'
  );
  assert.equal(root.scripts.termux, undefined);
  assert.equal(root.scripts['dev:termux'], 'sh scripts/termux-dev.sh');
  assert.equal(root.scripts.clean, 'node scripts/clean.mjs');
  assert.equal(root.scripts['check:docs'], 'node scripts/check-docs.mjs');
});

test('prepared build isolates API, Web type-check, and Vite into child processes', async () => {
  const source = await readFile(
    new URL('../../scripts/build-prepared.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /spawn/);
  assert.doesNotMatch(source, /emitTypeScriptProject|checkTypeScriptProject/);
  assert.doesNotMatch(source, /await import\(viteModule\)/);
});
