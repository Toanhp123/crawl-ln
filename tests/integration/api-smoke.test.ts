import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'novel-tool-api-'));
process.env.STORAGE_DIR = storageDir;
process.env.SOURCE_PROFILES_FILE = new URL(
  '../../apps/api/config/source-profiles.json',
  import.meta.url
).pathname;

const { createAppRuntime } = await import('../../apps/api/src/app.ts');
const runtime = createAppRuntime({ startBackgroundServices: false });
const server = runtime.app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('API test server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

test.after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  runtime.lifecycle.stop();
  await rm(storageDir, { recursive: true, force: true });
});

test('health endpoint reports a healthy service', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { ok: true, name: 'novel-tool' }, error: null });
});

test('empty storage routes return valid API envelopes', async () => {
  const expectations = [
    ['/api/novels', { items: [], total: 0, limit: 20, offset: 0 }],
    ['/api/tasks', []],
    ['/api/novels/stats', { novels: 0, analyzed: 0, crawling: 0, completed: 0, failed: 0 }],
    ['/api/search?q=missing', { query: 'missing', total: 0, limit: 20, offset: 0, items: [] }]
  ] as const;

  for (const [path, expectedData] of expectations) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    const body = (await response.json()) as { data: unknown; error: unknown };
    assert.deepEqual(body.error, null, path);
    assert.deepEqual(body.data, expectedData, path);
  }
});

test('API responses omit absent optional fields and use typed JSON errors', async () => {
  const status = await fetch(`${baseUrl}/api/scheduler/status`);
  assert.equal(status.status, 200);
  const statusBody = (await status.json()) as { data: Record<string, unknown> };
  assert.equal('lastTickAt' in statusBody.data, false);
  assert.equal('nextTickAt' in statusBody.data, false);

  const missing = await fetch(`${baseUrl}/api/novels/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    data: null,
    error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }
  });

  const removedLegacyExport = await fetch(`${baseUrl}/api/novels/missing/export`);
  assert.equal(removedLegacyExport.status, 404);
  assert.deepEqual(await removedLegacyExport.json(), {
    data: null,
    error: { code: 'NOT_FOUND', message: 'Route not found', details: null }
  });
});
