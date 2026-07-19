import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

test('cover restore uses path-relative containment instead of separator-sensitive prefix matching', async () => {
  const store = await source(
    'apps/api/src/modules/backup/infrastructure/sqlite/sqlite-backup.store.ts'
  );
  assert.match(store, /relative\(root, destination\)/);
  assert.match(store, /isAbsolute\(relativePath\)/);
  assert.doesNotMatch(store, /destination\.startsWith\(`\$\{root\}\//);
});

test('plugin watcher catches reload failures instead of dropping the promise', async () => {
  const registry = await source(
    'apps/api/src/modules/plugin/infrastructure/runtime/dynamic-source-plugin.registry.ts'
  );
  assert.match(registry, /requestReload\(\)/);
  assert.match(registry, /Plugin reload failed/);
});
