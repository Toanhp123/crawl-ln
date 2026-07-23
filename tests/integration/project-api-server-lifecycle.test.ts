import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';
import { startServer } from '../../apps/api/src/server.ts';

test('API server reports one URL and closes idempotently', async () => {
  const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-server-'));
  let running: { url: string; close(): Promise<void> } | undefined;

  try {
    const environment = createEnvironment({
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '3000',
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    running = await startServer({
      environment: { ...environment, port: 0 }
    });

    const response = await fetch(`${running.url}/health`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(body).data.ok, true);

    await Promise.all([running.close(), running.close()]);
    await assert.rejects(() => fetch(`${running?.url}/health`));
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

test('listen failure stops an already-started application lifecycle exactly once', async () => {
  let stopped = 0;
  const { startListeningRuntime } = await import('../../apps/api/src/server.ts');
  await assert.rejects(
    () =>
      startListeningRuntime({
        runtime: {
          app: {
            listen() {
              throw new Error('listen failed');
            }
          },
          ready: Promise.resolve(),
          lifecycle: {
            async stop() {
              stopped += 1;
            }
          }
        } as never,
        environment: { host: '127.0.0.1', port: 0 } as never
      }),
    /listen failed/
  );
  assert.equal(stopped, 1);
});

test('ready failure stops lifecycle without attempting to listen', async () => {
  let stopped = 0;
  let listened = 0;
  const { startListeningRuntime } = await import('../../apps/api/src/server.ts');
  await assert.rejects(
    () =>
      startListeningRuntime({
        runtime: {
          app: {
            listen() {
              listened += 1;
              throw new Error('listen must not run');
            }
          },
          ready: Promise.reject(new Error('ready failed')),
          lifecycle: {
            async stop() {
              stopped += 1;
            }
          }
        } as never,
        environment: { host: '127.0.0.1', port: 0 } as never
      }),
    /ready failed/
  );
  assert.equal(listened, 0);
  assert.equal(stopped, 1);
});
