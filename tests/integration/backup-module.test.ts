import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSqliteDatabase } from '../../apps/api/src/shared/database/sqlite.ts';
import { JsZipBackupArchive } from '../../apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts';
import { SqliteBackupStore } from '../../apps/api/src/modules/backup/infrastructure/sqlite/sqlite-backup.store.ts';
import { CreateBackupUseCase } from '../../apps/api/src/modules/backup/application/use-cases/create-backup.usecase.ts';
import { RestoreBackupUseCase } from '../../apps/api/src/modules/backup/application/use-cases/restore-backup.usecase.ts';

const clock = { now: () => new Date('2026-07-16T00:00:00.000Z') };

function insertNovel(database: ReturnType<typeof createSqliteDatabase>, id: string, url: string) {
  database.connection
    .prepare(
      `INSERT INTO novels(id,title,source_url,source_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`
    )
    .run(
      id,
      `Novel ${id}`,
      url,
      'test',
      'completed',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );
}

test('encrypted backup round-trips database and settings in replace mode', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'novel-tool-backup-'));
  const path = join(storage, 'novel-tool.sqlite');
  const database = createSqliteDatabase(path);
  try {
    insertNovel(database, 'n1', 'https://example.com/n1');
    const store = new SqliteBackupStore(database, path, storage);
    const archive = new JsZipBackupArchive();
    const create = new CreateBackupUseCase(store, archive, clock);
    const restore = new RestoreBackupUseCase(store, archive, clock);
    const artifact = await create.execute({
      password: 'secret',
      settings: { 'novel-tool-language': 'vi' }
    });

    database.connection.exec('DELETE FROM novels;');
    insertNovel(database, 'n2', 'https://example.com/n2');
    const result = await restore.execute({
      content: artifact.content,
      password: 'secret',
      mode: 'replace',
      settingsMode: 'use-backup'
    });

    const novels = database.connection.prepare('SELECT id FROM novels ORDER BY id').all() as Array<{
      id: string;
    }>;
    assert.deepEqual(
      novels.map((row) => row.id),
      ['n1']
    );
    assert.equal(result.settings?.['novel-tool-language'], 'vi');
    assert.ok(result.safetyBackupPath);
    assert.ok((await stat(result.safetyBackupPath!)).size > 0);
  } finally {
    database.close();
    await rm(storage, { recursive: true, force: true });
  }
});

test('merge keeps current records and adds missing backup records', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'novel-tool-backup-merge-'));
  const path = join(storage, 'novel-tool.sqlite');
  const database = createSqliteDatabase(path);
  try {
    insertNovel(database, 'n1', 'https://example.com/n1');
    const store = new SqliteBackupStore(database, path, storage);
    const archive = new JsZipBackupArchive();
    const artifact = await new CreateBackupUseCase(store, archive, clock).execute();
    insertNovel(database, 'n2', 'https://example.com/n2');

    await new RestoreBackupUseCase(store, archive, clock).execute({
      content: artifact.content,
      mode: 'merge',
      settingsMode: 'keep-current'
    });
    const novels = database.connection.prepare('SELECT id FROM novels ORDER BY id').all() as Array<{
      id: string;
    }>;
    assert.deepEqual(
      novels.map((row) => row.id),
      ['n1', 'n2']
    );
  } finally {
    database.close();
    await rm(storage, { recursive: true, force: true });
  }
});

test('encrypted backup rejects an incorrect password', async () => {
  const archive = new JsZipBackupArchive();
  const created = await archive.create(
    { database: Buffer.from('db'), settings: {}, covers: [] },
    'correct'
  );
  await assert.rejects(() => archive.open(created.content, 'wrong'), /Invalid backup password/);
});

test('merge remaps chapters when the same source URL has a different novel id', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'novel-tool-backup-remap-'));
  const path = join(storage, 'novel-tool.sqlite');
  const database = createSqliteDatabase(path);
  try {
    insertNovel(database, 'backup-id', 'https://example.com/shared');
    database.connection
      .prepare(
        `INSERT INTO chapters(id,novel_id,chapter_index,title,source_url,status) VALUES(?,?,?,?,?,?)`
      )
      .run(
        'backup-chapter',
        'backup-id',
        1,
        'Chapter 1',
        'https://example.com/shared/1',
        'fetched'
      );
    const store = new SqliteBackupStore(database, path, storage);
    const archive = new JsZipBackupArchive();
    const artifact = await new CreateBackupUseCase(store, archive, clock).execute();

    database.connection.exec('DELETE FROM novels;');
    insertNovel(database, 'current-id', 'https://example.com/shared');
    await new RestoreBackupUseCase(store, archive, clock).execute({
      content: artifact.content,
      mode: 'merge',
      settingsMode: 'keep-current'
    });

    const chapter = database.connection
      .prepare('SELECT novel_id FROM chapters WHERE chapter_index = 1')
      .get() as { novel_id: string };
    assert.equal(chapter.novel_id, 'current-id');
  } finally {
    database.close();
    await rm(storage, { recursive: true, force: true });
  }
});

test('replace rolls database back when cover restore fails', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'novel-tool-backup-rollback-'));
  const path = join(storage, 'novel-tool.sqlite');
  const database = createSqliteDatabase(path);
  try {
    insertNovel(database, 'backup-id', 'https://example.com/backup');
    const realStore = new SqliteBackupStore(database, path, storage);
    const archive = new JsZipBackupArchive();
    const artifact = await new CreateBackupUseCase(realStore, archive, clock).execute();
    database.connection.exec('DELETE FROM novels;');
    insertNovel(database, 'current-id', 'https://example.com/current');
    let calls = 0;
    const failingStore = {
      createSnapshot: realStore.createSnapshot.bind(realStore),
      restoreDatabase: realStore.restoreDatabase.bind(realStore),
      saveSafetyBackup: realStore.saveSafetyBackup.bind(realStore),
      restoreCovers: async (...args: Parameters<typeof realStore.restoreCovers>) => {
        calls += 1;
        if (calls === 1) throw new Error('disk full');
        return realStore.restoreCovers(...args);
      }
    };
    await assert.rejects(
      () =>
        new RestoreBackupUseCase(failingStore, archive, clock).execute({
          content: artifact.content,
          mode: 'replace',
          settingsMode: 'keep-current'
        }),
      /disk full/
    );
    const novels = database.connection.prepare('SELECT id FROM novels').all() as Array<{
      id: string;
    }>;
    assert.deepEqual(
      novels.map((row) => row.id),
      ['current-id']
    );
  } finally {
    database.close();
    await rm(storage, { recursive: true, force: true });
  }
});

test('encrypted replace creates an encrypted safety backup with current app metadata', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'novel-tool-backup-safety-'));
  const path = join(storage, 'novel-tool.sqlite');
  const database = createSqliteDatabase(path);
  try {
    insertNovel(database, 'n1', 'https://example.com/n1');
    const store = new SqliteBackupStore(database, path, storage);
    const archive = new JsZipBackupArchive();
    const artifact = await new CreateBackupUseCase(store, archive, clock).execute({
      password: 'secret'
    });
    const result = await new RestoreBackupUseCase(store, archive, clock).execute({
      content: artifact.content,
      password: 'secret',
      mode: 'replace',
      settingsMode: 'keep-current'
    });
    const safety = await import('node:fs/promises').then(({ readFile }) =>
      readFile(result.safetyBackupPath!)
    );
    await assert.rejects(() => archive.open(safety), /password is required/);
    const opened = await archive.open(safety, 'secret');
    assert.equal(opened.manifest.appVersion, '2.9.6');
    assert.equal(opened.manifest.schemaVersion, 14);
  } finally {
    database.close();
    await rm(storage, { recursive: true, force: true });
  }
});

test('merge matches chapters by source URL when chapter indexes have shifted', async () => {
  const storage = await mkdtemp(join(tmpdir(), 'novel-tool-backup-chapter-identity-'));
  const path = join(storage, 'novel-tool.sqlite');
  const database = createSqliteDatabase(path);
  try {
    insertNovel(database, 'backup-novel', 'https://example.com/shared-book');
    database.connection
      .prepare(
        `INSERT INTO chapters(id,novel_id,chapter_index,title,source_url,clean_text,status) VALUES(?,?,?,?,?,?,?)`
      )
      .run('backup-a', 'backup-novel', 10, 'A', 'https://example.com/a', 'backup A', 'fetched');
    const store = new SqliteBackupStore(database, path, storage);
    const archive = new JsZipBackupArchive();
    const artifact = await new CreateBackupUseCase(store, archive, clock).execute();

    database.connection.exec('DELETE FROM novels;');
    insertNovel(database, 'current-novel', 'https://example.com/shared-book');
    database.connection
      .prepare(
        `INSERT INTO chapters(id,novel_id,chapter_index,title,source_url,clean_text,status) VALUES(?,?,?,?,?,?,?)`
      )
      .run('current-x', 'current-novel', 10, 'X', 'https://example.com/x', 'current X', 'fetched');
    database.connection
      .prepare(
        `INSERT INTO chapters(id,novel_id,chapter_index,title,source_url,clean_text,status) VALUES(?,?,?,?,?,?,?)`
      )
      .run('current-a', 'current-novel', 11, 'A', 'https://example.com/a', 'current A', 'fetched');

    await new RestoreBackupUseCase(store, archive, clock).execute({
      content: artifact.content,
      mode: 'merge',
      settingsMode: 'keep-current'
    });

    const rows = database.connection
      .prepare('SELECT id,chapter_index,source_url,clean_text FROM chapters ORDER BY chapter_index')
      .all() as Array<{
      id: string;
      chapter_index: number;
      source_url: string;
      clean_text: string;
    }>;
    assert.deepEqual(
      rows.map((row) => row.id),
      ['current-x', 'current-a']
    );
    assert.equal(rows[1]?.clean_text, 'current A');
  } finally {
    database.close();
    await rm(storage, { recursive: true, force: true });
  }
});

test('backup creation enforces the same resource limits as restore', async () => {
  const archive = new JsZipBackupArchive({
    maxArchiveBytes: 4096,
    maxDatabaseBytes: 8,
    maxCoversBytes: 8,
    maxCoverBytes: 8,
    maxEntries: 4
  });
  await assert.rejects(
    () =>
      archive.create({
        database: Buffer.alloc(9),
        settings: {},
        covers: []
      }),
    /database is too large/i
  );
  await assert.rejects(
    () =>
      archive.create({
        database: Buffer.alloc(1),
        settings: {},
        covers: [{ path: 'large.jpg', content: Buffer.alloc(9) }]
      }),
    /cover is too large/i
  );
});

test('corrupted encrypted metadata is reported as a bad backup request', async () => {
  const JSZip = (await import('jszip')).default;
  const archive = new JsZipBackupArchive();
  const artifact = await archive.create(
    { database: Buffer.from('db'), settings: {}, covers: [] },
    'secret'
  );
  const outer = await JSZip.loadAsync(artifact.content);
  outer.file('crypto.json', '{not-json');
  const corrupted = await outer.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

  await assert.rejects(
    () => archive.open(corrupted, 'secret'),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Invalid or corrupted backup archive' &&
      'kind' in error &&
      error.kind === 'bad_request'
  );
});
