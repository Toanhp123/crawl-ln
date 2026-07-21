import assert from 'node:assert/strict';
import test from 'node:test';
import { currentApiRuntime } from './current-api.runtime.ts';
import { withContractServer } from './http-server.harness.ts';

test('current API exposes canonical health and JSON 404 contracts', async () => {
  await withContractServer(currentApiRuntime, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      data: { ok: true, name: 'novel-tool' },
      error: null
    });

    const missing = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Route not found', details: null }
    });
  });
});
