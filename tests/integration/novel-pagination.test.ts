import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const storageDir = await mkdtemp(join(tmpdir(), 'novel-tool-pagination-'));
process.env.STORAGE_DIR = storageDir;

const { createAppRuntime } = await import('../../apps/api/src/app.ts');
const runtime = createAppRuntime({ startBackgroundServices: false });
const server = runtime.app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('API test server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

const now = new Date().toISOString();
const dbPath = join(storageDir, 'novel-tool.sqlite');
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(dbPath);
for (const [index, title, status] of [
  [1, 'Gamma', 'completed'],
  [2, 'Alpha', 'analyzed'],
  [3, 'Beta', 'failed']
] as const) {
  db.prepare(
    `INSERT INTO novels (id, title, source_url, source_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(`n${index}`, title, `https://example.com/${index}`, 'example', status, now, now);
}
db.close();

test.after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  await runtime.lifecycle.stop();
  await rm(storageDir, { recursive: true, force: true });
});

test('novel listing paginates, filters and sorts on the server', async () => {
  const response = await fetch(`${baseUrl}/api/novels?sort=title&status=all&limit=2&offset=1`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: { items: Array<{ title: string }>; total: number; limit: number; offset: number };
  };
  assert.equal(body.data.total, 3);
  assert.equal(body.data.limit, 2);
  assert.equal(body.data.offset, 1);
  assert.deepEqual(
    body.data.items.map((item) => item.title),
    ['Beta', 'Gamma']
  );

  const filtered = await fetch(`${baseUrl}/api/novels?status=completed&limit=10&offset=0`);
  const filteredBody = (await filtered.json()) as {
    data: { items: Array<{ title: string }>; total: number };
  };
  assert.equal(filteredBody.data.total, 1);
  assert.deepEqual(
    filteredBody.data.items.map((item) => item.title),
    ['Gamma']
  );
});
