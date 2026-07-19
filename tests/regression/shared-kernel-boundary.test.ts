import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

test('shared kernel does not own source or chapter URL business policies', () => {
  const sharedDomain = resolve('apps/api/src/shared/domain');
  assert.equal(existsSync(sharedDomain), false);

  const architectureGuard = readFileSync(resolve('scripts/check-api-architecture.mjs'), 'utf8');
  assert.match(architectureGuard, /shared\/domain/);
});
