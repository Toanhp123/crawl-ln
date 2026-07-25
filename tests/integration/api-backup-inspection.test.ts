import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { BackupPasswordInvalidError } from '../../apps/api/src/modules/backup/application/errors/backup.error.ts';
import type { BackupArchivePort } from '../../apps/api/src/modules/backup/application/ports/backup-archive.port.ts';
import { BackupInventoryReader } from '../../apps/api/src/modules/backup/application/services/backup-inventory.reader.ts';
import { BackupSchemaMigrator } from '../../apps/api/src/modules/backup/application/services/backup-schema-migrator.ts';
import { RestoreInspectionCoordinator } from '../../apps/api/src/modules/backup/application/services/restore-inspection.coordinator.ts';
import { RestoreInspectionService } from '../../apps/api/src/modules/backup/application/services/restore-inspection.service.ts';
import { RestorePreparationService } from '../../apps/api/src/modules/backup/application/services/restore-preparation.service.ts';
import {
  assertSafeZipEntries,
  BACKUP_ARCHIVE_LIMITS
} from '../../apps/api/src/modules/backup/infrastructure/archive/backup-archive-safety.ts';
import { JsZipBackupArchive } from '../../apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';
import {
  createInspectionArchiveFixture,
  createPrimaryMigrationRegistry,
  restorePartialFingerprint
} from '../helpers/backup-archive.fixture.ts';

const now = new Date('2026-07-25T12:00:00.000Z');

async function setup(
  context: Parameters<typeof createBackupControlFixture>[0],
  options: { password?: string; schemaVersion?: number } = {}
) {
  const control = await createBackupControlFixture(context);
  const archiveRoot = await mkdtemp(join(tmpdir(), 'novel-tool-inspection-archive-'));
  context.after(() => rm(archiveRoot, { recursive: true, force: true }));
  const artifact = await createInspectionArchiveFixture(archiveRoot, options);
  const files = new NodeBackupFileStore(control.root);
  await files.initialize();
  let id = 0;
  const preparation = new RestorePreparationService(control.repository, files, {
    clock: { now: () => now },
    ids: { randomId: () => `restore-${++id}` }
  });
  const archive = new JsZipBackupArchive({ appVersion: '3.0.0-test', schemaVersion: 2 });
  const inspection = new RestoreInspectionService(
    control.repository,
    files,
    archive,
    preparation,
    new BackupSchemaMigrator(createPrimaryMigrationRegistry()),
    new BackupInventoryReader(),
    { now: () => now }
  );
  const created = await preparation.create({
    filename: 'archive.nvt',
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
  return { control, files, preparation, inspection, artifact, created };
}

test('complete rejects incomplete uploads before inspection starts', async (context) => {
  const control = await createBackupControlFixture(context);
  const files = new NodeBackupFileStore(control.root);
  await files.initialize();
  const preparation = new RestorePreparationService(control.repository, files, {
    clock: { now: () => now },
    ids: { randomId: () => 'incomplete' }
  });
  const created = await preparation.create({
    filename: 'archive.nvt',
    size: 10,
    fingerprint: `sha256-partial-v1:${'a'.repeat(64)}`,
    replaceExisting: false
  });
  const inspection = new RestoreInspectionService(
    control.repository,
    files,
    new JsZipBackupArchive({ appVersion: '3.0.0-test', schemaVersion: 2 }),
    preparation,
    new BackupSchemaMigrator(createPrimaryMigrationRegistry()),
    new BackupInventoryReader(),
    { now: () => now }
  );
  assert.throws(
    () => inspection.requestComplete(created.sessionId, created.sessionToken),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'RESTORE_UPLOAD_INCOMPLETE'
  );
});

test('coordinator schedules inspection after returning to the caller', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let entered = false;
  const coordinator = new RestoreInspectionCoordinator(
    {
      async complete() {
        entered = true;
        await gate;
        return {} as never;
      }
    } as RestoreInspectionService,
    { error: () => undefined }
  );
  coordinator.schedule('session');
  assert.equal(entered, false);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(entered, true);
  release();
  await coordinator.wait('session');
});

test('passwordless archive reaches ready with privacy-safe inventory and staged files', async (context) => {
  const fixture = await setup(context);
  const result = await fixture.inspection.complete(fixture.created.sessionId);
  assert.equal(result.state, 'ready');
  assert.match(result.inspectionToken ?? '', /^[A-Za-z0-9_-]+$/);
  assert.equal(result.inventory?.library.novels, 1);
  assert.equal(result.inventory?.library.chapters, 1);
  assert.equal(result.inventory?.sources.plugins, 1);
  assert.equal(result.inventory?.search.indexedDocuments, 2);
  assert.deepEqual(result.inventory?.settings, {
    groups: ['appearance', 'language', 'reader'],
    count: 3
  });
  assert.equal(result.compatibility?.targetSchemaVersion, 2);
  for (const name of ['database.sqlite', 'contributors.json', 'settings.json', 'manifest.json']) {
    assert.equal(await fixture.files.exists(fixture.files.validatedPath(result.id, name)), true);
  }
  const serialized = JSON.stringify(result.inventory);
  assert.doesNotMatch(
    serialized,
    /Fixture Novel|Fixture Chapter|chapter content|secretUnrecognizedValue/
  );
});

test('encrypted archive waits for password and counts exactly five failed attempts', async (context) => {
  const fixture = await setup(context, { password: 'correct-password' });
  const waiting = await fixture.inspection.complete(fixture.created.sessionId);
  assert.equal(waiting.state, 'awaiting-password');
  assert.equal(waiting.passwordFailures, 0);

  const passwordFailureArchive: BackupArchivePort = {
    create: () => Promise.reject(new Error('not used')),
    readManifest: () => Promise.resolve(fixture.artifact.manifest),
    open: () => Promise.reject(new BackupPasswordInvalidError())
  };
  const failingInspection = new RestoreInspectionService(
    fixture.control.repository,
    fixture.files,
    passwordFailureArchive,
    fixture.preparation,
    new BackupSchemaMigrator(createPrimaryMigrationRegistry()),
    new BackupInventoryReader(),
    { now: () => now }
  );

  for (const [index, remaining] of [4, 3, 2, 1, 0].entries()) {
    await assert.rejects(
      () => failingInspection.unlock(fixture.created.sessionId, `wrong-${index}`),
      (error: unknown) => {
        assert.equal(
          error instanceof Error && 'code' in error ? error.code : null,
          'BACKUP_PASSWORD_INVALID'
        );
        assert.equal(
          error instanceof Error && 'details' in error
            ? (error.details as { attemptsRemaining: number }).attemptsRemaining
            : null,
          remaining
        );
        return true;
      }
    );
  }
  const invalid = fixture.control.repository.findRestoreSession(fixture.created.sessionId);
  assert.equal(invalid?.state, 'invalid');
  assert.equal(invalid?.passwordFailures, 5);
  assert.equal(
    await fixture.files.exists(fixture.files.uploadArchivePath(fixture.created.sessionId)),
    false
  );
  assert.throws(
    () => fixture.preparation.read(fixture.created.sessionId, fixture.created.sessionToken),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'RESTORE_SESSION_TOKEN_INVALID'
  );
});

test('correct encrypted password reaches ready without exposing the password', async (context) => {
  const fixture = await setup(context, { password: 'correct-password' });
  await fixture.inspection.complete(fixture.created.sessionId);
  const ready = await fixture.inspection.unlock(fixture.created.sessionId, 'correct-password');
  assert.equal(ready.state, 'ready');
  assert.equal(ready.passwordFailures, 0);
  assert.doesNotMatch(
    JSON.stringify(fixture.control.repository.findRestoreSession(ready.id)),
    /correct-password/
  );
});

test('schema version one is migrated only in staging and reported as upgraded', async (context) => {
  const fixture = await setup(context, { schemaVersion: 1 });
  const sourceBefore = await readFile(fixture.artifact.current.databasePath);
  const ready = await fixture.inspection.complete(fixture.created.sessionId);
  assert.equal(ready.compatibility?.sourceSchemaVersion, 1);
  assert.equal(ready.compatibility?.targetSchemaVersion, 2);
  assert.equal(ready.compatibility?.upgradedFrom, 1);
  assert.deepEqual(await readFile(fixture.artifact.current.databasePath), sourceBefore);
});

test('archive safety rejects traversal before extraction', async () => {
  const outer = new JSZip();
  outer.file('../manifest.json', '{}');
  const content = await outer.generateAsync({ type: 'nodebuffer' });
  const archive = new JsZipBackupArchive({ appVersion: '3.0.0-test', schemaVersion: 2 });
  await assert.rejects(
    () => archive.readManifest(content),
    (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'bad_request'
  );
});

test('archive safety enforces absolute paths, symlinks, entry totals, sizes, and ratios', () => {
  const entry = (overrides: Record<string, unknown>) => ({
    name: 'entry',
    dir: false,
    unixPermissions: null,
    _data: { compressedSize: 10, uncompressedSize: 10 },
    ...overrides
  });
  const zip = (entries: Record<string, unknown>) => ({ files: entries }) as unknown as JSZip;

  for (const unsafe of [
    entry({ unsafeOriginalName: '/absolute' }),
    entry({ unsafeOriginalName: 'C:/absolute' }),
    entry({ unixPermissions: 0o120777 }),
    entry({
      _data: { compressedSize: 1, uncompressedSize: BACKUP_ARCHIVE_LIMITS.maxEntryBytes + 1 }
    }),
    entry({ _data: { compressedSize: 1, uncompressedSize: 101 } })
  ]) {
    assert.throws(
      () => assertSafeZipEntries(zip({ unsafe }), 'inner payload'),
      (error: unknown) => error instanceof Error && 'kind' in error && error.kind === 'bad_request'
    );
  }

  const tooMany = Object.fromEntries(
    Array.from({ length: BACKUP_ARCHIVE_LIMITS.maxEntries + 1 }, (_, index) => [
      `entry-${index}`,
      entry({ name: `entry-${index}` })
    ])
  );
  assert.throws(() => assertSafeZipEntries(zip(tooMany), 'inner payload'));
});

test('newer schemas and corrupt encrypted archives invalidate without consuming password attempts', async (context) => {
  const newer = await setup(context, { schemaVersion: 3 });
  await assert.rejects(
    () => newer.inspection.complete(newer.created.sessionId),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'BACKUP_SCHEMA_NEWER_THAN_APP'
  );
  assert.equal(
    newer.control.repository.findRestoreSession(newer.created.sessionId)?.state,
    'invalid'
  );

  const corrupt = await setup(context, { password: 'correct-password' });
  await corrupt.inspection.complete(corrupt.created.sessionId);
  const corruptArchive: BackupArchivePort = {
    create: () => Promise.reject(new Error('not used')),
    readManifest: () => Promise.resolve(corrupt.artifact.manifest),
    open: () => Promise.reject(new Error('corrupt inner archive'))
  };
  const inspection = new RestoreInspectionService(
    corrupt.control.repository,
    corrupt.files,
    corruptArchive,
    corrupt.preparation,
    new BackupSchemaMigrator(createPrimaryMigrationRegistry()),
    new BackupInventoryReader(),
    { now: () => now }
  );
  await assert.rejects(
    () => inspection.unlock(corrupt.created.sessionId, 'correct-password'),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'BACKUP_ARCHIVE_UNSAFE'
  );
  assert.equal(
    corrupt.control.repository.findRestoreSession(corrupt.created.sessionId)?.passwordFailures,
    0
  );
  assert.equal(
    corrupt.control.repository.findRestoreSession(corrupt.created.sessionId)?.state,
    'invalid'
  );
});

test('restart recovery reschedules passwordless inspection and preserves valid ready staging', async (context) => {
  const fixture = await setup(context);
  const session = fixture.control.repository.findRestoreSession(fixture.created.sessionId)!;
  fixture.control.repository.updateRestoreSession(session.id, {
    state: 'hashing',
    stage: 'hashing',
    encrypted: false
  });
  await fixture.files.writeInspectionFile(session.id, 'partial.tmp', Buffer.from('partial'));
  assert.deepEqual(await fixture.inspection.recoverInterruptedInspections(), [session.id]);
  assert.equal(fixture.control.repository.findRestoreSession(session.id)?.state, 'uploaded');

  await fixture.inspection.complete(session.id);
  assert.deepEqual(await fixture.inspection.recoverInterruptedInspections(), []);
  assert.equal(fixture.control.repository.findRestoreSession(session.id)?.state, 'ready');
});
