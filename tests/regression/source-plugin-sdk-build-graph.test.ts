import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const rootPackage = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

test('public commands prepare shared and SDK packages before API work', () => {
  assert.equal(rootPackage.scripts['prepare:packages'], 'node scripts/prepare-packages.mjs');
  assert.equal(rootPackage.scripts['build:sdk'], 'node scripts/prepare-sdk.mjs');
  assert.equal(rootPackage.scripts['check:sdk'], 'npm run check -w @novel-tool/source-plugin-sdk');

  for (const script of [
    'dev',
    'dev:api',
    'build',
    'build:api',
    'check',
    'check:api',
    'test:regression',
    'test:integration'
  ]) {
    assert.match(rootPackage.scripts[script], /prepare:packages/);
  }
  assert.equal(
    rootPackage.scripts['test:regression:prepared'],
    'node scripts/run-test-files.mjs regression'
  );
});

test('package preparation compiles shared and SDK without nested npm', () => {
  const source = read('scripts/prepare-packages.mjs');
  assert.match(source, /prepareShared/);
  assert.match(source, /prepareSdk/);
  assert.doesNotMatch(source, /npm|spawn|exec/);
});

test('verification prepares all packages exactly once', () => {
  const source = read('scripts/verify.mjs');
  assert.match(source, /name: 'prepare:packages'/);
  assert.match(source, /scripts\/prepare-packages\.mjs/);
  assert.doesNotMatch(source, /name: 'prepare:shared'/);
});

test('prepared checks and clean include the SDK package', () => {
  const checks = read('scripts/check-prepared.mjs');
  const clean = read('scripts/clean.mjs');
  assert.match(checks, /packages', 'source-plugin-sdk', 'tsconfig\.json'/);
  assert.match(clean, /packages\/source-plugin-sdk\/dist/);
});
