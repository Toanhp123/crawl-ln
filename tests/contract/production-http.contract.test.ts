import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEnvironment } from '../../apps/api/src/platform/config/environment.ts';
import { startServer } from '../../apps/api/src/server.ts';

async function readResponse(response: Response): Promise<string> {
  return response.text();
}

test('production server preserves API errors and serves SPA assets from one port', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-production-http-'));
  const publicDirectory = join(root, 'public');
  const storageDirectory = join(root, 'storage');
  let running: { url: string; close(): Promise<void> } | undefined;

  try {
    await mkdir(join(publicDirectory, 'assets'), { recursive: true });
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(
      join(publicDirectory, 'index.html'),
      '<!doctype html><title>Novel Tool</title>'
    );
    await writeFile(join(publicDirectory, 'assets/app.js'), 'console.log("app")');

    const environment = createEnvironment({
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '3000',
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    running = await startServer({
      environment: { ...environment, port: 0 },
      publicDirectory
    });

    const health = await fetch(`${running.url}/health`);
    const healthBody = await readResponse(health);
    assert.equal(health.status, 200);
    assert.match(health.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(JSON.parse(healthBody).data.ok, true);

    const apiMiss = await fetch(`${running.url}/api/not-a-route`);
    const apiMissBody = await readResponse(apiMiss);
    assert.equal(apiMiss.status, 404);
    assert.match(apiMiss.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(JSON.parse(apiMissBody).error.code, 'NOT_FOUND');

    const asset = await fetch(`${running.url}/assets/app.js`);
    const assetBody = await readResponse(asset);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control') ?? '', /immutable/);
    assert.match(assetBody, /console\.log/);

    const spa = await fetch(`${running.url}/library/fixture`);
    const spaBody = await readResponse(spa);
    assert.equal(spa.status, 200);
    assert.match(spa.headers.get('content-type') ?? '', /text\/html/);
    assert.match(spaBody, /Novel Tool/);

    const postMiss = await fetch(`${running.url}/library/fixture`, {
      method: 'POST'
    });
    const postMissBody = await readResponse(postMiss);
    assert.equal(postMiss.status, 404);
    assert.match(postMiss.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(JSON.parse(postMissBody).error.code, 'NOT_FOUND');
  } finally {
    await running?.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: process.platform === 'win32' ? 10 : 0,
      retryDelay: 100
    });
  }
});
