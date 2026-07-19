import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const moduleFactories = [
  'chapters.module.ts',
  'crawler.module.ts',
  'novels.module.ts',
  'source-reader.module.ts',
  'scheduler.module.ts',
  'tasks.module.ts'
];

test('cross-module backend surfaces are constrained by module-owned public facades', () => {
  for (const filename of moduleFactories) {
    const path = `apps/api/src/shared/container/modules/${filename}`;
    const source = readFileSync(path, 'utf8');
    assert.match(source, /modules\/.+\/public\/.+\.api\.js/, path);
    assert.match(source, /satisfies\s+\w+(?:Api|Lifecycle)/, path);
  }
});

test('novels module no longer exposes an internal persistence escape hatch', () => {
  const source = readFileSync('apps/api/src/shared/container/modules/novels.module.ts', 'utf8');
  assert.doesNotMatch(source, /\binternal\s*:/);
});
