import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { HttpContractRuntime } from './http-contract.types.ts';
import { withContractServer } from './http-server.harness.ts';

const now = '2026-07-21T10:00:00.000Z';

function seedCurrent(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database
      .prepare(
        `INSERT INTO novels(id, title, source_url, source_name, status, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?)`
      )
      .run(
        'novel-1',
        'Realtime Novel',
        'https://fixture.test/realtime',
        'fixture',
        'completed',
        now,
        now
      );
  } finally {
    database.close();
  }
}

function seedNext(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database
      .prepare(
        `INSERT INTO library_novels(
           id, title, source_url, source_name, status, created_at, updated_at
         ) VALUES(?,?,?,?,?,?,?)`
      )
      .run(
        'novel-1',
        'Realtime Novel',
        'https://fixture.test/realtime',
        'fixture',
        'completed',
        now,
        now
      );
  } finally {
    database.close();
  }
}

const currentRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-current-realtime-'));
    const previousStorage = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = storageDirectory;
    try {
      const { createAppRuntime } = await import('../../apps/api/src/app.ts');
      const runtime = createAppRuntime({ startBackgroundServices: false });
      seedCurrent(join(storageDirectory, 'novel-tool.sqlite'));
      return {
        app: runtime.app,
        async close() {
          try {
            await runtime.lifecycle.stop();
          } finally {
            await rm(storageDirectory, { recursive: true, force: true });
          }
        }
      };
    } finally {
      if (previousStorage === undefined) delete process.env.STORAGE_DIR;
      else process.env.STORAGE_DIR = previousStorage;
    }
  }
};

const nextRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-next-realtime-'));
    const { createEnvironment } =
      await import('../../apps/api-next/src/platform/config/environment.ts');
    const { createNextAppRuntime } = await import('../../apps/api-next/src/app.ts');
    const environment = createEnvironment({
      ...process.env,
      NEXT_STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    const runtime = createNextAppRuntime({ environment });
    await runtime.ready;
    seedNext(environment.databasePath);
    return {
      app: runtime.app,
      async close() {
        try {
          await runtime.lifecycle.stop();
        } finally {
          await rm(storageDirectory, { recursive: true, force: true });
        }
      }
    };
  }
};

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (content: string) => boolean
): Promise<string> {
  const decoder = new TextDecoder();
  let content = '';
  const timeout = setTimeout(() => void reader.cancel('SSE timeout'), 5_000);
  try {
    while (!predicate(content)) {
      const chunk = await reader.read();
      if (chunk.done) break;
      content += decoder.decode(chunk.value, { stream: true });
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertRealtimeContract(baseUrl: string): Promise<void> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const reader = response.body!.getReader();
  const handshake = await readUntil(reader, (content) => content.includes(': connected\n\n'));
  assert.match(handshake, /retry: 3000/);

  const update = await fetch(`${baseUrl}/api/novels/novel-1/auto-update`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, intervalMinutes: 360 })
  });
  assert.equal(update.status, 200);

  const streamed = await readUntil(reader, (content) => content.includes('data: '));
  const dataLine = streamed.split('\n').find((line) => line.startsWith('data: '));
  assert.ok(dataLine);
  const event = JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>;
  assert.equal(event.type, 'data.changed');
  assert.deepEqual(event.resources, ['scheduler', 'novels']);
  assert.equal(event.reason, 'scheduler.policy.updated');
  assert.equal(event.novelId, 'novel-1');
  assert.equal(typeof event.id, 'string');
  assert.equal(typeof event.occurredAt, 'string');

  controller.abort();
  await reader.cancel().catch(() => undefined);
}

for (const [name, runtime] of [
  ['current', currentRuntime],
  ['next', nextRuntime]
] as const) {
  test(`${name} API preserves realtime SSE handshake and mutation events`, async () => {
    await withContractServer(runtime, assertRealtimeContract);
  });
}
