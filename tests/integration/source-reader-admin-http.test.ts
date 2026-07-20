import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'source-reader-admin-http-'));
process.env.STORAGE_DIR = storageDir;
const { createAppRuntime } = await import('../../apps/api/src/app.ts');
const runtime = createAppRuntime({ startBackgroundServices: false });
const server = runtime.app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

test.after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await runtime.lifecycle.stop();
  await rm(storageDir, { recursive: true, force: true });
});

test('admin list endpoints return redacted metadata envelopes', async () => {
  for (const path of ['/plugins', '/credentials', '/network-profiles', '/auth/challenges']) {
    const response = await fetch(`${baseUrl}/api/source-reader${path}`, {
      headers: { 'x-source-reader-user-id': 'user-1' }
    });
    assert.equal(response.status, 200, path);
    const body = (await response.json()) as { data: unknown; error: unknown };
    assert.deepEqual(body.error, null, path);
    assert.equal(JSON.stringify(body.data).includes('encrypted_'), false, path);
  }
});

test('plugin installation requires a bounded multipart package', async () => {
  const response = await fetch(`${baseUrl}/api/source-reader/plugins/install`, {
    method: 'POST',
    headers: { 'x-source-reader-user-id': 'admin-1' }
  });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'PLUGIN_RESULT_INVALID');
});
