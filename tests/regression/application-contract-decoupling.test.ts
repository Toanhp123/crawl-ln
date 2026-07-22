import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('backend application layers own their contracts instead of importing shared transport DTOs', () => {
  const files = walk('apps/api-legacy/src/modules').filter((path) =>
    path.includes('/application/')
  );
  const offenders = files.filter((path) =>
    readFileSync(path, 'utf8').includes("'@novel-tool/shared'")
  );
  assert.deepEqual(offenders, []);
});
