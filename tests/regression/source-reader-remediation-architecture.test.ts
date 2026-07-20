import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const productionFiles = [
  'apps/api/src/modules/source-reader/infrastructure/runtime',
  'apps/api/src/modules/source-reader/application',
  'apps/api/src/modules/source-reader/presentation'
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('legacy worker runtime is removed and external plugins use only the process sandbox', async () => {
  assert.equal(
    await exists('apps/api/src/modules/source-reader/infrastructure/runtime/isolated-worker'),
    false
  );
  const architecture = await readFile('scripts/check-api-architecture.mjs', 'utf8');
  assert.match(architecture, /IsolatedWorkerPluginRuntime/);
  assert.match(architecture, /node:worker_threads/);
  assert.match(architecture, /sandbox-module-loader/);
  assert.ok(productionFiles.length > 0);
});

test('external RPC schemas never expose ambient context, repository, or vault fields', async () => {
  const schema = await readFile(
    'apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.schema.ts',
    'utf8'
  );
  assert.doesNotMatch(schema, /\bcontext\s*:/);
  assert.doesNotMatch(schema, /\brepository\s*:/);
  assert.doesNotMatch(schema, /\bvault\s*:/);
});

test('admin surface exposes safe plugin diagnostics and no force-enable route', async () => {
  const routes = await readFile(
    'apps/api/src/modules/source-reader/presentation/routes/source-reader.routes.ts',
    'utf8'
  );
  assert.match(routes, /router\.get\('\/plugins\/:pluginId'/);
  assert.doesNotMatch(routes, /force-enable|forceEnable/);
});
