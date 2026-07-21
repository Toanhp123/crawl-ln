import assert from 'node:assert/strict';
import test from 'node:test';
import { nextApiRuntime } from './api-next.runtime.ts';
import { currentApiRuntime } from './current-api.runtime.ts';
import { withContractServer } from './http-server.harness.ts';

async function assertCoreHttpContract(baseUrl: string): Promise<void> {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    data: { ok: true, name: 'novel-tool' },
    error: null
  });

  for (const path of ['/api/not-a-route', '/not-a-route']) {
    const missing = await fetch(`${baseUrl}${path}`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Route not found', details: null }
    });
  }

  const allowedOrigin = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'http://localhost:5173' }
  });
  assert.equal(allowedOrigin.status, 200);
  assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const deniedOrigin = await fetch(`${baseUrl}/health`, {
    headers: { origin: 'https://denied.example' }
  });
  assert.equal(deniedOrigin.status, 403);
  assert.deepEqual(await deniedOrigin.json(), {
    data: null,
    error: {
      code: 'FORBIDDEN',
      message: 'Origin is not allowed: https://denied.example',
      details: null
    }
  });

  const preflight = await fetch(`${baseUrl}/api/search`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'content-type'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /GET/);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'content-type');
}

for (const [name, runtime] of [
  ['current', currentApiRuntime],
  ['next', nextApiRuntime]
] as const) {
  test(`${name} API exposes canonical health and JSON 404 contracts`, async () => {
    await withContractServer(runtime, assertCoreHttpContract);
  });
}
