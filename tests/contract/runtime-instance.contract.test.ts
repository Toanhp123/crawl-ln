import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';
import { startServer } from '../../apps/api/src/server.ts';

test('runtime endpoint returns one stable marker identity', async () => {
  const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-runtime-'));
  let running: { url: string; close(): Promise<void> } | undefined;

  try {
    const environment = createEnvironment({
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '3000',
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    running = await startServer({ environment: { ...environment, port: 0 } });

    const firstResponse = await fetch(`${running.url}/api/runtime`);
    const first = (await firstResponse.json()) as any;
    const secondResponse = await fetch(`${running.url}/api/runtime`);
    const second = (await secondResponse.json()) as any;

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.match(first.data.instanceId, /^[0-9a-f-]{36}$/i);
    assert.equal(second.data.instanceId, first.data.instanceId);

    const marker = JSON.parse(
      await readFile(join(storageDirectory, '.novel-tool-runtime.json'), 'utf8')
    );
    assert.equal(marker.instanceId, first.data.instanceId);
  } finally {
    await running?.close();
    await rm(storageDirectory, {
      recursive: true,
      force: true,
      maxRetries: process.platform === 'win32' ? 10 : 0,
      retryDelay: 100
    });
  }
});
