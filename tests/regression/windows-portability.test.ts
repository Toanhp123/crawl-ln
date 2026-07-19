import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiPackage = JSON.parse(
  await readFile(new URL('../../apps/api/package.json', import.meta.url), 'utf8')
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
