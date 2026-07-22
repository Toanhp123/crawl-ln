import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('shared kernel does not own source or chapter URL business policies', () => {
  for (const sharedDomain of [
    resolve('apps/api/src/shared/domain'),
    resolve('apps/api-legacy/src/shared/domain')
  ]) {
    assert.equal(existsSync(sharedDomain), false);
  }

  const architectureGuard = readFileSync(
    resolve('scripts/check-api-legacy-architecture.mjs'),
    'utf8'
  );
  assert.match(architectureGuard, /shared\/domain/);
});
