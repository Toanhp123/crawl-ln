import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { createBackupModule } from '../../apps/api/src/modules/backup/backup.module.ts';
import { IngestionBackupContributor } from '../../apps/api/src/modules/ingestion/infrastructure/backup/ingestion-backup.contributor.ts';
import { ingestionMigrations } from '../../apps/api/src/modules/ingestion/index.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/index.ts';
import { createLibraryModule } from '../../apps/api/src/modules/library/library.module.ts';
import { SchedulerBackupContributor } from '../../apps/api/src/modules/scheduler/infrastructure/backup/scheduler-backup.contributor.ts';
import { schedulerMigrations } from '../../apps/api/src/modules/scheduler/index.ts';
import { searchMigrations } from '../../apps/api/src/modules/search/index.ts';
import { createSearchModule } from '../../apps/api/src/modules/search/search.module.ts';
import { SourceReaderBackupContributor } from '../../apps/api/src/modules/source-reader/infrastructure/backup/source-reader-backup.contributor.ts';
import { ModuleRegistry } from '../../apps/api/src/bootstrap/module-registry.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/index.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { InMemoryEventBus } from '../../apps/api/src/platform/events/in-memory-event-bus.ts';
import type { BackupContributor } from '../../apps/api/src/platform/backup/backup-contributor.ts';
import { createCurrentDatabaseFixture } from '../helpers/current-database.fixture.ts';

const now = new Date('2026-07-21T09:00:00.000Z');

test('module registry exposes module-owned backup contributors in registration order', () => {
  const first: BackupContributor = {
    module: 'first',
    exportMergeData: () => Promise.resolve({}),
    importMergeData: () => Promise.resolve()
  };
  const second: BackupContributor = {
    module: 'second',
    exportMergeData: () => Promise.resolve({}),
    importMergeData: () => Promise.resolve()
  };
  const registry = new ModuleRegistry();
  registry.register(
    { name: 'first', migrations: [], backup: first },
    { name: 'without-backup', migrations: [] },
    { name: 'second', migrations: [], backup: second }
  );

  assert.deepEqual(registry.backupContributors(), [first, second]);
});

function migrate(database: SqliteDatabase): void {
  const registry = new MigrationRegistry();
  registry.register('library', libraryMigrations);
  registry.register('ingestion', ingestionMigrations);
  registry.register('scheduler', schedulerMigrations);
  registry.register('search', searchMigrations);
  registry.register('source-reader', sourceReaderMigrations);
  runRegisteredMigrations(database, registry);
}

function contributors(database: SqliteDatabase): BackupContributor[] {
  const library = createLibraryModule(database);
  const search = createSearchModule({
    database,
    library: library.api.queries,
    events: new InMemoryEventBus(),
    clock: { now: () => now }
  });
  return [
    library.backup,
    new IngestionBackupContributor(database),
    new SchedulerBackupContributor(database),
    new SourceReaderBackupContributor(database),
    search.backup
  ];
}

function backupModule(database: SqliteDatabase, databasePath: string, storageDirectory: string) {
  return createBackupModule({
    database,
    databasePath,
    storageDirectory,
    contributors: contributors(database),
    clock: { now: () => now },
    appVersion: '3.0.0-test',
    schemaVersion: 1
  });
}

async function removeContributor(content: Buffer, module: string): Promise<Buffer> {
  const outer = await JSZip.loadAsync(content);
  const manifestFile = outer.file('manifest.json');
  const payloadFile = outer.file('payload.zip');
  if (!manifestFile || !payloadFile) throw new Error('Expected an unencrypted backup');
  const manifest = JSON.parse(await manifestFile.async('string')) as Record<string, unknown>;
  const payload = await JSZip.loadAsync(await payloadFile.async('nodebuffer'));
  const contributorsFile = payload.file('contributors.json');
  if (!contributorsFile) throw new Error('Contributor data is missing');
  const contributors = JSON.parse(await contributorsFile.async('string')) as Record<
    string,
    unknown
  >;
  delete contributors[module];
  payload.file('contributors.json', JSON.stringify(contributors));
  const payloadContent = await payload.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  manifest.payloadSize = payloadContent.length;
  manifest.checksumSha256 = createHash('sha256').update(payloadContent).digest('hex');
  outer.file('manifest.json', JSON.stringify(manifest));
  outer.file('payload.zip', payloadContent);
  return outer.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

test('backup merge restores contributor data, settings and search projection', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-backup-merge-'));
  const fixture = await createCurrentDatabaseFixture(root);
  const sourcePath = fixture.databasePath;
  const source = new SqliteDatabase(sourcePath);
  const sourceBackup = backupModule(source, sourcePath, join(root, 'source-storage'));
  let target: SqliteDatabase | undefined;
  t.after(async () => {
    target?.close();
    source.close();
    await rm(root, { recursive: true, force: true });
  });

  const artifact = await sourceBackup.api.commands.create({
    password: 'secret-password',
    settings: { theme: 'sepia' }
  });
  assert.equal(artifact.contentType, 'application/vnd.novel-tool.backup');
  assert.equal(artifact.encrypted, true);
  assert.match(artifact.filename, /^novel-tool-backup-2026-07-21T09-00-00-000Z\.nvt$/);

  const targetPath = join(root, 'target.sqlite');
  target = new SqliteDatabase(targetPath);
  migrate(target);
  const targetBackup = backupModule(target, targetPath, join(root, 'target-storage'));

  const result = await targetBackup.api.commands.restore({
    content: artifact.content,
    password: 'secret-password',
    mode: 'merge',
    settingsMode: 'use-backup'
  });

  assert.equal(result.mode, 'merge');
  assert.deepEqual(result.settings, { theme: 'sepia' });
  assert.equal(result.safetyBackupPath, null);
  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM library_novels').get() as {
          count: number;
        }
      ).count
    ),
    1
  );
  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM source_reader_plugins').get() as {
          count: number;
        }
      ).count
    ),
    1
  );
  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM search_documents').get() as {
          count: number;
        }
      ).count
    ),
    2
  );
});

test('backup merge remaps module references onto existing source identities', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-backup-remap-'));
  const fixture = await createCurrentDatabaseFixture(root);
  const sourcePath = fixture.databasePath;
  const source = new SqliteDatabase(sourcePath);
  let target: SqliteDatabase | undefined;
  t.after(async () => {
    target?.close();
    source.close();
    await rm(root, { recursive: true, force: true });
  });
  const artifact = await backupModule(
    source,
    sourcePath,
    join(root, 'source-storage')
  ).api.commands.create();
  const sourceNovel = source.connection
    .prepare('SELECT * FROM library_novels WHERE id = ?')
    .get(fixture.ids.novelId) as Record<string, string | number | null>;
  const sourceChapter = source.connection
    .prepare('SELECT * FROM library_chapters WHERE id = ?')
    .get(fixture.ids.chapterId) as Record<string, string | number | null>;

  const targetPath = join(root, 'target.sqlite');
  target = new SqliteDatabase(targetPath);
  migrate(target);
  target.connection
    .prepare(
      `INSERT INTO library_novels(
         id, title, source_url, source_name, author, cover_url, status, created_at, updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`
    )
    .run(
      'current-novel',
      'Current title',
      sourceNovel.source_url,
      sourceNovel.source_name,
      sourceNovel.author,
      sourceNovel.cover_url,
      sourceNovel.status,
      sourceNovel.created_at,
      sourceNovel.updated_at
    );
  target.connection
    .prepare(
      `INSERT INTO library_chapters(
         id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status,
         error_message, source_available, content_version, created_at, updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      'current-chapter',
      'current-novel',
      Number(sourceChapter.chapter_index) + 10,
      sourceChapter.title,
      sourceChapter.source_url,
      '<p>Current content.</p>',
      'Current content.',
      'fetched',
      null,
      1,
      7,
      sourceChapter.created_at,
      sourceChapter.updated_at
    );

  await backupModule(target, targetPath, join(root, 'target-storage')).api.commands.restore({
    content: artifact.content,
    mode: 'merge',
    settingsMode: 'keep-current'
  });

  const novels = target.connection.prepare('SELECT id FROM library_novels').all() as Array<{
    id: string;
  }>;
  assert.deepEqual(
    novels.map((novel) => novel.id),
    ['current-novel']
  );
  const chapters = target.connection
    .prepare('SELECT id, clean_text, content_version FROM library_chapters')
    .all() as Array<{ id: string; clean_text: string; content_version: number }>;
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0]?.id, 'current-chapter');
  assert.equal(chapters[0]?.clean_text, 'Current content.');
  assert.equal(chapters[0]?.content_version, 7);
  assert.equal(
    (
      target.connection
        .prepare('SELECT novel_id FROM ingestion_jobs WHERE id = ?')
        .get(fixture.ids.taskId) as { novel_id: string }
    ).novel_id,
    'current-novel'
  );
  assert.equal(
    (
      target.connection
        .prepare('SELECT chapter_id FROM ingestion_job_chapters WHERE job_id = ?')
        .get(fixture.ids.taskId) as { chapter_id: string }
    ).chapter_id,
    'current-chapter'
  );
  assert.equal(
    (
      target.connection.prepare('SELECT novel_id FROM scheduler_policies').get() as {
        novel_id: string;
      }
    ).novel_id,
    'current-novel'
  );
});

test('invalid contributor data rolls back an otherwise valid merge archive', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-backup-rollback-'));
  const fixture = await createCurrentDatabaseFixture(root);
  const sourcePath = fixture.databasePath;
  const source = new SqliteDatabase(sourcePath);
  let target: SqliteDatabase | undefined;
  t.after(async () => {
    target?.close();
    source.close();
    await rm(root, { recursive: true, force: true });
  });
  const artifact = await backupModule(
    source,
    sourcePath,
    join(root, 'source-storage')
  ).api.commands.create();
  const corrupted = await removeContributor(artifact.content, 'search');

  const targetPath = join(root, 'target.sqlite');
  target = new SqliteDatabase(targetPath);
  migrate(target);
  await assert.rejects(
    () =>
      backupModule(target!, targetPath, join(root, 'target-storage')).api.commands.restore({
        content: corrupted,
        mode: 'merge',
        settingsMode: 'keep-current'
      }),
    (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'bad_request'
  );

  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM library_novels').get() as {
          count: number;
        }
      ).count
    ),
    0
  );
  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM source_reader_plugins').get() as {
          count: number;
        }
      ).count
    ),
    0
  );
});

test('backup replace swaps an offline database and rejects corruption safely', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-backup-replace-'));
  const fixture = await createCurrentDatabaseFixture(root);
  const sourcePath = fixture.databasePath;
  const source = new SqliteDatabase(sourcePath);
  const artifact = await backupModule(
    source,
    sourcePath,
    join(root, 'source-storage')
  ).api.commands.create();
  source.close();

  const targetPath = join(root, 'target.sqlite');
  const target = new SqliteDatabase(targetPath);
  migrate(target);
  const targetBackup = backupModule(target, targetPath, join(root, 'target-storage'));
  t.after(async () => {
    target.close();
    await rm(root, { recursive: true, force: true });
  });

  await assert.rejects(
    () =>
      targetBackup.api.commands.restore({
        content: Buffer.from('not-a-backup'),
        mode: 'replace',
        settingsMode: 'keep-current'
      }),
    (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'bad_request'
  );
  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM library_novels').get() as {
          count: number;
        }
      ).count
    ),
    0
  );

  const result = await targetBackup.api.commands.restore({
    content: artifact.content,
    mode: 'replace',
    settingsMode: 'keep-current'
  });
  assert.equal(result.mode, 'replace');
  assert.equal(Boolean(result.safetyBackupPath && existsSync(result.safetyBackupPath)), true);
  assert.equal(
    Number(
      (
        target.connection.prepare('SELECT COUNT(*) AS count FROM library_novels').get() as {
          count: number;
        }
      ).count
    ),
    1
  );
});
