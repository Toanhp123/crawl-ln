import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRuntime } from './api-next.runtime.ts';
import { currentApiRuntime } from './current-api.runtime.ts';
import { withContractServer } from './http-server.harness.ts';

async function assertSearchHttpContract(baseUrl: string): Promise<void> {
  const search = await fetch(`${baseUrl}/api/search?q=missing`);
  assert.equal(search.status, 200);
  assert.deepEqual(await search.json(), {
    data: { query: 'missing', total: 0, limit: 20, offset: 0, items: [] },
    error: null
  });

  const rebuild = await fetch(`${baseUrl}/api/search/rebuild`, { method: 'POST' });
  assert.equal(rebuild.status, 200);
  assert.deepEqual(await rebuild.json(), {
    data: { indexedDocuments: 0 },
    error: null
  });

  const invalid = await fetch(`${baseUrl}/api/search?q=valid&type=unknown`);
  assert.equal(invalid.status, 400);
  assert.equal(
    ((await invalid.json()) as { error: { code: string } }).error.code,
    'VALIDATION_ERROR'
  );
}

for (const [name, runtime] of [
  ['current', currentApiRuntime],
  ['next', apiRuntime]
] as const) {
  test(`${name} API preserves the search HTTP contract`, async () => {
    await withContractServer(runtime, assertSearchHttpContract);
  });
}
