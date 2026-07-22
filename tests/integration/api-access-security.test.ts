import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'novel-tool-api-access-'));
process.env.STORAGE_DIR = storageDir;
const { createAppRuntime } = await import('../../apps/api-legacy/src/app.ts');
const runtime = createAppRuntime({ startBackgroundServices: false });
const server = runtime.app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
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

test('health and local API requests work without a remote bearer token', async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);

  const novels = await fetch(`${baseUrl}/api/novels`);
  assert.equal(novels.status, 200);
});

test('configured CORS rejects arbitrary browser origins', async () => {
  const denied = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'https://evil.example' }
  });
  assert.equal(denied.status, 403);
  const body = (await denied.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'FORBIDDEN');

  const allowed = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'http://localhost:5173' }
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});
