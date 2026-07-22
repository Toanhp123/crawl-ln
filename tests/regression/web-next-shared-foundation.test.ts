import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = 'apps/web/src/shared';

async function readTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

async function listFiles(directory: string, base = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(target, base)));
    else files.push(relative(base, target).replaceAll('\\', '/'));
  }
  return files.sort();
}

test('shared query persistence receives policy instead of naming entity roots', async () => {
  const source = await readFile(`${root}/api/query-persistence.ts`, 'utf8');
  assert.match(source, /shouldPersist\s*:\s*\(query:\s*Query\)\s*=>\s*boolean/);
  assert.doesNotMatch(source, /novels|chapters|tasks|scheduler|source-reader/i);
});

test('shared theme excludes reader-owned tokens and runtime state', async () => {
  const files = await readTree(`${root}/theme`);
  assert.doesNotMatch(
    files,
    /data-reader-|ReaderPreferences|reader-chapter-enter|reader-content-max|--reader-|\.reader-/i
  );
  assert.match(files, /--color-primary/);
  assert.match(files, /--space-4/);
  assert.match(files, /--radius-lg/);
});

test('shared localization composes generic catalogs without product interpretation', async () => {
  const files = await readTree(`${root}/i18n`);
  assert.doesNotMatch(files, /chapterContent|sourceReader|crawlTask|schedulerStatus/i);
  assert.match(files, /mergeCatalogs/);
  assert.match(files, /common\.close/);
});

test('shared realtime exposes only generic transport and batching primitives', async () => {
  const source = await readTree(`${root}/realtime`);
  assert.match(source, /'connecting'\s*\|\s*'connected'\s*\|\s*'disconnected'/);
  assert.match(source, /createEventStream/);
  assert.match(source, /createBatchQueue/);
  assert.match(source, /decoder/);
  assert.doesNotMatch(source, /invalidateQueries|queryKeys|novelId|taskId|resources/i);
});

test('shared public APIs expose the platform foundation', async () => {
  const api = await import('../../apps/web/src/shared/api/index.ts');
  const i18n = await import('../../apps/web/src/shared/i18n/index.ts');
  const lib = await import('../../apps/web/src/shared/lib/index.ts');
  const realtime = await import('../../apps/web/src/shared/realtime/index.ts');

  assert.equal(typeof api.http, 'function');
  assert.equal(typeof api.createQueryClient, 'function');
  assert.equal(typeof api.restoreQueryCache, 'function');
  assert.equal(typeof i18n.mergeCatalogs, 'function');
  assert.equal(typeof lib.cn, 'function');
  assert.equal(typeof realtime.createEventStream, 'function');
  assert.equal(typeof realtime.createBatchQueue, 'function');
});

test('catalog composition is ordered and immutable by convention', async () => {
  const { mergeCatalogs } = await import('../../apps/web/src/shared/i18n/catalog.ts');
  const merged = mergeCatalogs({ a: 'first', shared: 'old' }, { b: 'second', shared: 'new' });
  assert.deepEqual(merged, { a: 'first', b: 'second', shared: 'new' });
});

test('event stream parses JSON through the caller decoder and reports connection state', async () => {
  const { createEventStream } = await import('../../apps/web/src/shared/realtime/event-stream.ts');
  const statuses: string[] = [];
  const values: number[] = [];
  let closed = false;
  const source = {
    onopen: null as ((event: Event) => void) | null,
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    close() {
      closed = true;
    }
  };

  const stream = createEventStream<number>({
    url: '/events',
    decoder(value) {
      assert.deepEqual(value, { value: 7 });
      return 7;
    },
    onValue(value) {
      values.push(value);
    },
    onStatus(status) {
      statuses.push(status);
    },
    createSource: () => source as unknown as EventSource
  });

  source.onopen?.(new Event('open'));
  source.onmessage?.(new MessageEvent('message', { data: '{"value":7}' }));
  stream.close();

  assert.deepEqual(statuses, ['connecting', 'connected', 'disconnected']);
  assert.deepEqual(values, [7]);
  assert.equal(closed, true);
});

test('batch queue groups caller values and disposes pending work', async () => {
  const { createBatchQueue } = await import('../../apps/web/src/shared/realtime/batch-queue.ts');
  const batches: number[][] = [];
  const queue = createBatchQueue<number>((values) => batches.push([...values]), { windowMs: 5 });
  queue.enqueue(1);
  queue.enqueue(2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(batches, [[1, 2]]);

  queue.enqueue(3);
  queue.dispose();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(batches, [[1, 2]]);
});

test('visual foundation carries the current primitive surface', async () => {
  const files = await listFiles(`${root}/ui`);
  const required = [
    'actions/Button.tsx',
    'data-display/DataTable.tsx',
    'feedback/QueryStateBoundary.tsx',
    'forms/SearchInput.tsx',
    'layout/AppViewport.tsx',
    'navigation/BottomNav.tsx',
    'overlay/Modal.tsx',
    'index.ts'
  ];
  for (const file of required) assert.ok(files.includes(file), `${file} is missing`);
  assert.ok(files.length >= 45, `expected the primitive library, received ${files.length} files`);
});
