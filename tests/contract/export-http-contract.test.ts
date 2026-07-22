import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import JSZip from 'jszip';
import type { HttpContractRuntime } from './http-contract.types.ts';
import { withContractServer } from './http-server.harness.ts';

const now = '2026-07-21T08:00:00.000Z';

function seedCurrentDatabase(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database
      .prepare(
        `INSERT INTO novels(id, title, source_url, source_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'novel-1',
        'Dragon Book',
        'https://fixture.test/novel-1',
        'fixture',
        'completed',
        now,
        now
      );
    const insert = database.prepare(
      `INSERT INTO chapters(
         id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      'chapter-1',
      'novel-1',
      1,
      'Chapter One',
      'https://fixture.test/novel-1/chapter-1',
      'Raw one',
      'Clean one',
      'fetched'
    );
    insert.run(
      'chapter-2',
      'novel-1',
      2,
      'Chapter Two',
      'https://fixture.test/novel-1/chapter-2',
      null,
      null,
      'failed'
    );
    insert.run(
      'chapter-3',
      'novel-1',
      3,
      'Chapter Three',
      'https://fixture.test/novel-1/chapter-3',
      'Raw three',
      'Clean three',
      'fetched'
    );
  } finally {
    database.close();
  }
}

function seedNextDatabase(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database
      .prepare(
        `INSERT INTO library_novels(
           id, title, source_url, source_name, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'novel-1',
        'Dragon Book',
        'https://fixture.test/novel-1',
        'fixture',
        'completed',
        now,
        now
      );
    const insert = database.prepare(
      `INSERT INTO library_chapters(
         id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status,
         source_available, content_version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
    );
    insert.run(
      'chapter-1',
      'novel-1',
      1,
      'Chapter One',
      'https://fixture.test/novel-1/chapter-1',
      'Raw one',
      'Clean one',
      'fetched',
      now,
      now
    );
    insert.run(
      'chapter-2',
      'novel-1',
      2,
      'Chapter Two',
      'https://fixture.test/novel-1/chapter-2',
      null,
      null,
      'failed',
      now,
      now
    );
    insert.run(
      'chapter-3',
      'novel-1',
      3,
      'Chapter Three',
      'https://fixture.test/novel-1/chapter-3',
      'Raw three',
      'Clean three',
      'fetched',
      now,
      now
    );
  } finally {
    database.close();
  }
}

const currentExportRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-current-export-'));
    const previousStorage = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = storageDirectory;
    try {
      const { createAppRuntime } = await import('../../apps/api-legacy/src/app.ts');
      const runtime = createAppRuntime({ startBackgroundServices: false });
      await runtime.ready;
      seedCurrentDatabase(join(storageDirectory, 'novel-tool.sqlite'));
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

const nextExportRuntime: HttpContractRuntime = {
  async create() {
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-next-export-'));
    const { createEnvironment } = await import('../../apps/api/src/platform/config/environment.ts');
    const { createAppRuntime } = await import('../../apps/api/src/app.ts');
    const environment = createEnvironment({
      ...process.env,
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    const runtime = createAppRuntime({ environment });
    await runtime.ready;
    seedNextDatabase(environment.databasePath);
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

async function assertExportHttpContract(baseUrl: string): Promise<void> {
  const textResponse = await fetch(`${baseUrl}/api/exports/novels/novel-1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      format: 'txt',
      downloadedOnly: true,
      range: { from: 2, to: 3 }
    })
  });
  assert.equal(textResponse.status, 200);
  assert.equal(
    textResponse.headers.get('content-disposition'),
    'attachment; filename="dragon-book.txt"'
  );
  assert.equal(textResponse.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(textResponse.headers.get('x-export-chapter-count'), '1');
  const text = Buffer.from(await textResponse.arrayBuffer()).toString('utf8');
  assert.ok(text.startsWith('\uFEFF'));
  assert.match(text, /Chapter Three/);
  assert.doesNotMatch(text, /Chapter One|Chapter Two/);

  const epubResponse = await fetch(`${baseUrl}/api/exports/novels/novel-1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      format: 'epub',
      downloadedOnly: true,
      range: { from: 1, to: 1 }
    })
  });
  assert.equal(epubResponse.status, 200);
  assert.equal(epubResponse.headers.get('content-type'), 'application/epub+zip');
  assert.equal(epubResponse.headers.get('x-export-chapter-count'), '1');
  const zip = await JSZip.loadAsync(Buffer.from(await epubResponse.arrayBuffer()));
  assert.equal(await zip.file('mimetype')!.async('string'), 'application/epub+zip');
  assert.ok(zip.file('OEBPS/chapters/chapter-1.xhtml'));

  const missing = await fetch(`${baseUrl}/api/exports/novels/missing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format: 'txt', downloadedOnly: true })
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    data: null,
    error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }
  });

  const conflict = await fetch(`${baseUrl}/api/exports/novels/novel-1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      format: 'txt',
      downloadedOnly: true,
      range: { from: 2, to: 2 }
    })
  });
  assert.equal(conflict.status, 409);
  assert.equal(((await conflict.json()) as { error: { code: string } }).error.code, 'CONFLICT');
}

for (const [name, runtime] of [
  ['current', currentExportRuntime],
  ['next', nextExportRuntime]
] as const) {
  test(`${name} API preserves the export HTTP contract`, async () => {
    await withContractServer(runtime, assertExportHttpContract);
  });
}
