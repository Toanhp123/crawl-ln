import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { HttpContractRuntime } from './http-contract.types.ts';
import { withContractServer } from './http-server.harness.ts';

const now = '2026-07-21T12:00:00.000Z';

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
        'Backup Novel',
        'https://fixture.test/backup',
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
        'Backup Novel',
        'https://fixture.test/backup',
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
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-current-backup-http-'));
    const previousStorage = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = storageDirectory;
    try {
      const { createAppRuntime } = await import('../../apps/api-legacy/src/app.ts');
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
    const storageDirectory = await mkdtemp(join(tmpdir(), 'novel-tool-next-backup-http-'));
    const { createEnvironment } = await import('../../apps/api/src/platform/config/environment.ts');
    const { createAppRuntime } = await import('../../apps/api/src/app.ts');
    const environment = createEnvironment({
      ...process.env,
      STORAGE_DIR: storageDirectory,
      SOURCE_READER_PLUGIN_DIR: join(storageDirectory, 'source-plugins')
    });
    const runtime = createAppRuntime({ environment });
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

async function assertBackupContract(baseUrl: string): Promise<void> {
  const created = await fetch(`${baseUrl}/api/backups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'secret-password', settings: { theme: 'sepia' } })
  });
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('content-type'), 'application/vnd.novel-tool.backup');
  assert.equal(created.headers.get('x-backup-encrypted'), 'true');
  assert.match(
    created.headers.get('content-disposition') ?? '',
    /^attachment; filename="novel-tool-backup-.+\.nvt"$/
  );
  const artifact = Buffer.from(await created.arrayBuffer());
  assert.ok(artifact.length > 0);

  const corrupted = await fetch(`${baseUrl}/api/backups/restore`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-restore-mode': 'merge',
      'x-settings-mode': 'keep-current'
    },
    body: Buffer.from('not-a-backup')
  });
  assert.equal(corrupted.status, 400);
  assert.equal(((await corrupted.json()) as { error: { code: string } }).error.code, 'BAD_REQUEST');

  const deleted = await fetch(`${baseUrl}/api/novels/novel-1`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);

  const restored = await fetch(`${baseUrl}/api/backups/restore`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-restore-mode': 'merge',
      'x-settings-mode': 'use-backup',
      'x-backup-password': 'secret-password'
    },
    body: artifact
  });
  assert.equal(restored.status, 200);
  const result = (await restored.json()) as {
    data: {
      mode: string;
      settings: Record<string, unknown> | null;
      safetyBackupPath: string | null;
      restored: Record<string, number>;
    };
  };
  assert.equal(result.data.mode, 'merge');
  assert.deepEqual(result.data.settings, { theme: 'sepia' });
  assert.equal(result.data.safetyBackupPath, null);
  assert.equal(typeof result.data.restored, 'object');

  const novel = await fetch(`${baseUrl}/api/novels/novel-1`);
  assert.equal(novel.status, 200);
  assert.equal(
    ((await novel.json()) as { data: { novel: { title: string } } }).data.novel.title,
    'Backup Novel'
  );
}

for (const [name, runtime] of [
  ['current', currentRuntime],
  ['next', nextRuntime]
] as const) {
  test(`${name} API preserves encrypted backup and merge-restore HTTP contracts`, async () => {
    await withContractServer(runtime, assertBackupContract);
  });
}
