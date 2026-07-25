import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BackupContributorCoordinator } from '../../apps/api/src/modules/backup/application/services/backup-contributor-coordinator.ts';
import { BackupInventoryReader } from '../../apps/api/src/modules/backup/application/services/backup-inventory.reader.ts';
import { BackupMergePlanner } from '../../apps/api/src/modules/backup/application/services/backup-merge-planner.ts';
import { BackupSchemaMigrator } from '../../apps/api/src/modules/backup/application/services/backup-schema-migrator.ts';
import { RestoreInspectionService } from '../../apps/api/src/modules/backup/application/services/restore-inspection.service.ts';
import { RestorePreparationService } from '../../apps/api/src/modules/backup/application/services/restore-preparation.service.ts';
import { JsZipBackupArchive } from '../../apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import { IngestionBackupContributor } from '../../apps/api/src/modules/ingestion/infrastructure/backup/ingestion-backup.contributor.ts';
import { ingestionMigrations } from '../../apps/api/src/modules/ingestion/index.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/index.ts';
import { createLibraryModule } from '../../apps/api/src/modules/library/library.module.ts';
import { SchedulerBackupContributor } from '../../apps/api/src/modules/scheduler/infrastructure/backup/scheduler-backup.contributor.ts';
import { schedulerMigrations } from '../../apps/api/src/modules/scheduler/index.ts';
import { searchMigrations } from '../../apps/api/src/modules/search/index.ts';
import { createSearchModule } from '../../apps/api/src/modules/search/search.module.ts';
import { SourceReaderBackupContributor } from '../../apps/api/src/modules/source-reader/infrastructure/backup/source-reader-backup.contributor.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/index.ts';
import type { BackupContributor } from '../../apps/api/src/platform/backup/backup-contributor.ts';
import { fingerprintSqliteTables } from '../../apps/api/src/platform/backup/sqlite-table-snapshot.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { InMemoryEventBus } from '../../apps/api/src/platform/events/in-memory-event-bus.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';
import {
  createPrimaryMigrationRegistry,
  restorePartialFingerprint
} from '../helpers/backup-archive.fixture.ts';
import { createCurrentDatabaseFixture } from '../helpers/current-database.fixture.ts';

const now = new Date('2026-07-25T14:00:00.000Z');

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
    clock: { now: () => now },
    ids: { randomId: () => 'restore-plan-search-event' }
  });
  return [
    library.backup,
    new SourceReaderBackupContributor(database),
    new IngestionBackupContributor(database),
    new SchedulerBackupContributor(database),
    search.backup
  ];
}

async function setup(context: Parameters<typeof createBackupControlFixture>[0]) {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-merge-plan-'));
  const sourceFixture = await createCurrentDatabaseFixture(join(root, 'source'));
  const source = new SqliteDatabase(sourceFixture.databasePath);
  const targetPath = join(root, 'target.sqlite');
  const target = new SqliteDatabase(targetPath);
  migrate(target);
  context.after(async () => {
    source.close();
    target.close();
    await rm(root, { recursive: true, force: true });
  });

  const sourceCoordinator = new BackupContributorCoordinator(contributors(source));
  const creator = new JsZipBackupArchive({ appVersion: '3.0.0-test', schemaVersion: 2 });
  const artifact = await creator.create({
    database: await readFile(sourceFixture.databasePath),
    contributors: await sourceCoordinator.exportAll(),
    settings: {
      'novel-tool.theme': 'dark',
      'novel-tool.language': 'vi',
      'novel-tool.reader.fontSize': 18,
      secretCredentialValue: 'must-not-leak'
    }
  });

  const control = await createBackupControlFixture(context);
  const files = new NodeBackupFileStore(control.root);
  await files.initialize();
  const targetCoordinator = new BackupContributorCoordinator(contributors(target));
  const planner = new BackupMergePlanner(target, targetCoordinator, { now: () => now });
  let id = 0;
  const preparation = new RestorePreparationService(
    control.repository,
    files,
    {
      clock: { now: () => now },
      ids: { randomId: () => `plan-session-${++id}` }
    },
    planner
  );
  const inspection = new RestoreInspectionService(
    control.repository,
    files,
    creator,
    preparation,
    new BackupSchemaMigrator(createPrimaryMigrationRegistry()),
    new BackupInventoryReader(),
    { now: () => now }
  );
  const created = await preparation.create({
    filename: 'private-source-name.nvt',
    size: artifact.content.length,
    fingerprint: restorePartialFingerprint(artifact.content),
    replaceExisting: false
  });
  await preparation.append({
    sessionId: created.sessionId,
    sessionToken: created.sessionToken,
    offset: 0,
    content: artifact.content
  });
  const ready = await inspection.complete(created.sessionId);
  assert.equal(ready.state, 'ready');
  return {
    root,
    source,
    sourceFixture,
    target,
    targetCoordinator,
    control,
    files,
    preparation,
    inspection,
    created,
    ready
  };
}

function rowCount(database: SqliteDatabase, table: string): number {
  return Number(
    (
      database.connection.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as {
        count: number;
      }
    ).count
  );
}

test('Merge planning uses the real import path and rolls every preview write back', async (context) => {
  const fixture = await setup(context);
  const tables = fixture.targetCoordinator.fingerprintTables();
  const before = fingerprintSqliteTables(fixture.target.connection, tables);
  const result = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );

  assert.deepEqual(result.plan.contributorImpact.library, {
    novelsAdded: 1,
    novelsSkipped: 0,
    chaptersAdded: 1,
    chaptersSkipped: 0,
    novelRemaps: 0,
    chapterRemaps: 0
  });
  assert.deepEqual(result.plan.impact, {
    novelsNew: 1,
    novelsExisting: 0,
    chaptersAdded: 1,
    chaptersSkipped: 0,
    sourceRemaps: 0,
    tasksRestored: 1,
    schedulerPoliciesRestored: 1,
    searchDocumentsRebuilt: 2,
    settingsOutcome: 'keep-current'
  });
  assert.equal(result.pendingSettings, null);
  assert.match(result.planFingerprint, /^sha256-plan-v1:[a-f0-9]{64}$/);
  assert.equal(result.plan.targetFingerprint, before);
  assert.equal(fingerprintSqliteTables(fixture.target.connection, tables), before);
  for (const table of [
    'library_novels',
    'library_chapters',
    'ingestion_jobs',
    'source_reader_plugins',
    'scheduler_policies',
    'search_documents'
  ]) {
    assert.equal(rowCount(fixture.target, table), 0);
  }
});

test('plan fingerprints are canonical, choice-sensitive, and tokens rotate', async (context) => {
  const fixture = await setup(context);
  const first = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );
  const second = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );
  assert.equal(second.planFingerprint, first.planFingerprint);
  assert.notEqual(second.inspectionToken, first.inspectionToken);
  assert.equal(fixture.inspection.inspectionToken(fixture.created.sessionId), null);

  const settingsChanged = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'use-backup' }
  );
  assert.notEqual(settingsChanged.planFingerprint, first.planFingerprint);
  assert.deepEqual(settingsChanged.pendingSettings, {
    'novel-tool.theme': 'dark',
    'novel-tool.language': 'vi',
    'novel-tool.reader.fontSize': 18,
    secretCredentialValue: 'must-not-leak'
  });
  const modeChanged = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'replace', settingsPolicy: 'keep-current' }
  );
  assert.notEqual(modeChanged.planFingerprint, first.planFingerprint);
});

test('relevant target changes alter Merge fingerprints and impact while derived search rows do not', async (context) => {
  const fixture = await setup(context);
  const first = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );

  const sourceNovel = fixture.source.connection
    .prepare('SELECT * FROM library_novels WHERE id = ?')
    .get(fixture.sourceFixture.ids.novelId) as Record<string, string | number | null>;
  fixture.target.connection
    .prepare(
      `INSERT INTO library_novels(
         id,title,source_url,source_name,author,cover_url,status,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)`
    )
    .run(
      'current-target-novel',
      'Target-only title',
      sourceNovel.source_url,
      sourceNovel.source_name,
      sourceNovel.author,
      sourceNovel.cover_url,
      sourceNovel.status,
      sourceNovel.created_at,
      sourceNovel.updated_at
    );
  const relevant = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );
  assert.notEqual(relevant.planFingerprint, first.planFingerprint);
  assert.equal(relevant.plan.impact.novelsExisting, 1);
  assert.equal(relevant.plan.impact.novelsNew, 0);
  assert.equal(relevant.plan.impact.sourceRemaps, 1);
  assert.equal(relevant.plan.impact.chaptersAdded, 1);

  fixture.target.connection
    .prepare(
      `INSERT INTO search_documents(
         document_type,document_id,novel_id,chapter_index,title,subtitle,content
       ) VALUES(?,?,?,?,?,?,?)`
    )
    .run('novel', 'derived-only', 'derived-only', null, 'Derived row', '', 'ignored');
  const derivedOnly = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );
  assert.equal(derivedOnly.planFingerprint, relevant.planFingerprint);
});

test('Replace planning reports inventory totals without simulating Merge', async (context) => {
  const fixture = await setup(context);
  const before = fingerprintSqliteTables(
    fixture.target.connection,
    fixture.targetCoordinator.fingerprintTables()
  );
  const result = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'replace', settingsPolicy: 'use-backup' }
  );
  assert.equal(result.plan.targetFingerprint, null);
  assert.deepEqual(result.plan.contributorImpact, {});
  assert.equal(result.plan.impact.replaceAll, true);
  assert.equal(result.plan.impact.novelsTotal, 1);
  assert.equal(result.plan.impact.chaptersTotal, 1);
  assert.equal(result.plan.impact.tasksTotal, 1);
  assert.equal(result.plan.impact.searchDocumentsTotal, 2);
  assert.equal(result.plan.impact.novelsNew, 0);
  assert.equal(
    fingerprintSqliteTables(
      fixture.target.connection,
      fixture.targetCoordinator.fingerprintTables()
    ),
    before
  );
});

test('plan responses and control metadata remain privacy-safe', async (context) => {
  const fixture = await setup(context);
  const result = await fixture.preparation.createPlan(
    fixture.created.sessionId,
    fixture.created.sessionToken,
    { mode: 'merge', settingsPolicy: 'keep-current' }
  );
  const response = JSON.stringify(result);
  assert.doesNotMatch(
    response,
    /Fixture Novel|Fixture Chapter|chapter content|secretCredentialValue|backup-control\.sqlite|validated[\\/]|temporaryRoot|sessionTokenHash|inspectionTokenHash/
  );
  const stored = JSON.stringify(fixture.control.repository.findRestoreSession(result.id));
  assert.doesNotMatch(stored, /secretCredentialValue|must-not-leak/);
  assert.doesNotMatch(
    stored,
    new RegExp(result.inspectionToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
});
