import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'source-reader-degraded-'));
process.env.STORAGE_DIR = storageDir;
delete process.env.SOURCE_READER_MASTER_KEY;
const { createAppRuntime } = await import('../../apps/api-legacy/src/app.ts');
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

test('public source reading remains available without a master key', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
});
