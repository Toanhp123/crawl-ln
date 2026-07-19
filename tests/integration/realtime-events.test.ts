import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = './storage/test-realtime-events';

const { createAppRuntime } = await import('../../apps/api/src/app.ts');

async function readUntilEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (value: unknown) => boolean
): Promise<unknown> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timed out waiting for realtime event')), 3000)
      )
    ]);
    if (result.done) throw new Error('Realtime stream closed unexpectedly');
    buffer += decoder.decode(result.value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim();
      if (!data) continue;
      const parsed: unknown = JSON.parse(data);
      if (predicate(parsed)) return parsed;
    }
  }
}

test('SSE endpoint streams scheduler changes after a successful mutation', async () => {
  const runtime = createAppRuntime({ startBackgroundServices: false });
  const server = createServer(runtime.app);
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const streamResponse = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(streamResponse.headers.get('cache-control'), 'no-cache');
    assert.ok(streamResponse.body);
    reader = streamResponse.body.getReader();

    const mutation = await fetch(`${baseUrl}/api/scheduler/tick`, { method: 'POST' });
    assert.equal(mutation.status, 200);

    const event = (await readUntilEvent(
      reader,
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { resources?: unknown }).resources) &&
        (value as { resources: string[] }).resources.includes('scheduler')
    )) as { type: string; reason: string; resources: string[] };

    assert.equal(event.type, 'data.changed');
    assert.equal(event.reason, 'scheduler.tick.completed');
    assert.deepEqual(event.resources, ['scheduler']);
  } finally {
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    await runtime.lifecycle.stop();
    server.closeAllConnections();
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
});
