import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { BackupCleanupService } from '../../apps/api/src/modules/backup/application/services/backup-cleanup.service.ts';
import {
  canTransitionRestoreSession,
  createOpaqueToken,
  RESTORE_SESSION_ABSOLUTE_MS,
  RESTORE_SESSION_IDLE_MS,
  restoreSessionExpiry,
  tokenMatches,
  type CreateRestoreSessionRecord
} from '../../apps/api/src/modules/backup/domain/restore-session.models.ts';
import { NodeBackupFileStore } from '../../apps/api/src/modules/backup/infrastructure/filesystem/node-backup-file.store.ts';
import { createBackupControlFixture } from '../helpers/backup-control.fixture.ts';

const baseNow = new Date('2026-07-25T00:00:00.000Z');

function sessionInput(
  id: string,
  overrides: Partial<CreateRestoreSessionRecord> = {}
): CreateRestoreSessionRecord {
  const token = createOpaqueToken();
  const absolute = new Date(baseNow.getTime() + RESTORE_SESSION_ABSOLUTE_MS);
  return {
    id,
    sessionTokenHash: token.hash,
    inspectionTokenHash: null,
    state: 'uploading',
    stage: 'uploading',
    originalFilename: 'backup.nvt',
    expectedBytes: 16,
    receivedBytes: 0,
    fileFingerprint: `sha256-partial-v1:${'a'.repeat(64)}`,
    archiveChecksum: null,
    encrypted: null,
    passwordFailures: 0,
    inventory: null,
    compatibility: null,
    mergePlan: null,
    mergePlanFingerprint: null,
    selectedMode: null,
    settingsPolicy: null,
    temporaryRoot: `session:${id}`,
    createdAt: baseNow.toISOString(),
    lastActivityAt: baseNow.toISOString(),
    expiresAt: restoreSessionExpiry(baseNow, absolute).toISOString(),
    absoluteExpiresAt: absolute.toISOString(),
    lockedOperationId: null,
    ...overrides
  };
}

test('restore session schema constrains state, byte limits, passwords, and one current row', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const table = fixture.database.connection
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'backup_restore_sessions'"
    )
    .get() as { sql: string };
  const currentIndex = fixture.database.connection
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = 'backup_restore_sessions_one_current'"
    )
    .get() as { sql: string };

  assert.match(table.sql, /expected_bytes > 0 AND expected_bytes <= 536870912/);
  assert.match(table.sql, /received_bytes >= 0 AND received_bytes <= expected_bytes/);
  assert.match(table.sql, /password_failures BETWEEN 0 AND 5/);
  assert.match(table.sql, /CHECK\(expires_at <= absolute_expires_at\)/);
  assert.doesNotMatch(table.sql, /session_token\s+TEXT/i);
  assert.doesNotMatch(table.sql, /inspection_token\s+TEXT/i);
  assert.match(currentIndex.sql, /state NOT IN \('consumed','cancelled','expired','invalid'\)/);

  fixture.repository.createRestoreSession(sessionInput('first'));
  assert.throws(
    () => fixture.repository.createRestoreSession(sessionInput('second')),
    /UNIQUE constraint failed/
  );
  fixture.repository.updateRestoreSession('first', { state: 'cancelled', stage: 'cancelled' });
  assert.equal(fixture.repository.createRestoreSession(sessionInput('second')).id, 'second');
});

test('restore session rows round-trip privacy-safe JSON and nullable booleans', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const created = fixture.repository.createRestoreSession(
    sessionInput('mapped', {
      state: 'ready',
      stage: 'ready',
      encrypted: true,
      inventory: {
        createdAt: baseNow.toISOString(),
        appVersion: '1.0.0',
        schemaVersion: 2,
        archiveSizeBytes: 10,
        encrypted: true,
        library: { novels: 1, analyzedNovels: 1, chapters: 2, fetchedChapters: 1 },
        sources: { plugins: 1, credentials: 0, networkProfiles: 0 },
        ingestion: { tasks: 1, events: 2 },
        scheduler: { policies: 1, diagnostics: 0 },
        search: { indexedDocuments: 2 },
        settings: { groups: ['appearance'], count: 1 }
      },
      compatibility: {
        formatVersion: 3,
        sourceSchemaVersion: 2,
        targetSchemaVersion: 2,
        minimumSupportedSchemaVersion: 1,
        upgradedFrom: null,
        compatible: true
      }
    })
  );

  assert.equal(created.encrypted, true);
  assert.equal(created.inventory?.library.novels, 1);
  assert.equal(created.compatibility?.compatible, true);
  assert.deepEqual(fixture.repository.findRestoreSession(created.id), created);
  assert.equal(fixture.repository.findCurrentRestoreSession()?.id, created.id);
});

test('opaque tokens store only hashes and compare in fixed length', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.notEqual(first.plaintext, second.plaintext);
  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.equal(tokenMatches(first.plaintext, first.hash), true);
  assert.equal(tokenMatches(first.plaintext, second.hash), false);
  assert.equal(tokenMatches('', first.hash), false);
  assert.equal(tokenMatches('x'.repeat(513), first.hash), false);
  assert.equal(tokenMatches(first.plaintext, 'not-a-hash'), false);
});

test('restore session state machine allows only declared transitions', () => {
  assert.equal(canTransitionRestoreSession('uploading', 'uploaded'), true);
  assert.equal(canTransitionRestoreSession('uploaded', 'hashing'), true);
  assert.equal(canTransitionRestoreSession('inspecting', 'awaiting-password'), true);
  assert.equal(canTransitionRestoreSession('ready', 'ready'), true);
  assert.equal(canTransitionRestoreSession('ready', 'locked'), true);
  assert.equal(canTransitionRestoreSession('locked', 'consumed'), true);
  assert.equal(canTransitionRestoreSession('uploading', 'ready'), false);
  assert.equal(canTransitionRestoreSession('consumed', 'ready'), false);
  assert.equal(canTransitionRestoreSession('invalid', 'uploading'), false);
});

test('sliding expiry extends thirty minutes without crossing the absolute lifetime', () => {
  const absolute = new Date(baseNow.getTime() + RESTORE_SESSION_ABSOLUTE_MS);
  assert.equal(
    restoreSessionExpiry(baseNow, absolute).toISOString(),
    new Date(baseNow.getTime() + RESTORE_SESSION_IDLE_MS).toISOString()
  );
  const nearEnd = new Date(absolute.getTime() - 5 * 60_000);
  assert.equal(restoreSessionExpiry(nearEnd, absolute).toISOString(), absolute.toISOString());
});

test('cleanup expires abandoned sessions, clears data, and preserves locked sessions', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const files = new NodeBackupFileStore(fixture.root);
  await files.initialize();

  fixture.repository.createRestoreSession(
    sessionInput('expired', {
      expiresAt: '2026-07-25T00:05:00.000Z',
      absoluteExpiresAt: '2026-07-25T01:00:00.000Z'
    })
  );
  await files.initializeSession('expired');
  await writeFile(files.uploadArchivePath('expired'), Buffer.from('partial'));
  await mkdir(files.validatedRoot('expired'), { recursive: true });
  await writeFile(files.validatedPath('expired', 'database.sqlite'), Buffer.from('db'));

  const cleanup = new BackupCleanupService(fixture.repository, files, {
    clock: { now: () => new Date('2026-07-25T00:10:00.000Z') }
  });
  const result = await cleanup.run();

  assert.equal(result.sessionsExpired, 1);
  assert.equal(fixture.repository.findRestoreSession('expired')?.state, 'expired');
  assert.equal(fixture.repository.findRestoreSession('expired')?.inspectionTokenHash, null);
  assert.equal(existsSync(files.uploadRoot('expired')), false);
  assert.equal(existsSync(files.inspectionRoot('expired')), false);
  assert.ok(await stat(files.root));

  const second = await cleanup.run();
  assert.equal(second.sessionsExpired, 0);
});

test('cleanup does not expire a locked restore session', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const files = new NodeBackupFileStore(fixture.root);
  await files.initialize();
  fixture.repository.createRestoreSession(
    sessionInput('locked', {
      state: 'locked',
      stage: 'restoring',
      expiresAt: '2026-07-25T00:05:00.000Z',
      absoluteExpiresAt: '2026-07-25T01:00:00.000Z'
    })
  );

  const cleanup = new BackupCleanupService(fixture.repository, files, {
    clock: { now: () => new Date('2026-07-25T00:10:00.000Z') }
  });
  const result = await cleanup.run();

  assert.equal(result.sessionsExpired, 0);
  assert.equal(fixture.repository.findRestoreSession('locked')?.state, 'locked');
});

import { BackupOperationError } from '../../apps/api/src/modules/backup/application/errors/backup.error.ts';
import {
  RESTORE_UPLOAD_CHUNK_BYTES,
  RESTORE_UPLOAD_MAX_BYTES
} from '../../apps/api/src/modules/backup/domain/restore-session.models.ts';
import { RestorePreparationService } from '../../apps/api/src/modules/backup/application/services/restore-preparation.service.ts';

function validFingerprint(character = 'b'): `sha256-partial-v1:${string}` {
  return `sha256-partial-v1:${character.repeat(64)}`;
}

async function preparationFixture(context: import('node:test').TestContext) {
  const control = await createBackupControlFixture(context);
  const files = new NodeBackupFileStore(control.root);
  await files.initialize();
  let id = 0;
  let now = new Date('2026-07-25T00:00:00.000Z');
  const service = new RestorePreparationService(control.repository, files, {
    clock: { now: () => now },
    ids: { randomId: () => `session-${++id}` }
  });
  return {
    ...control,
    files,
    service,
    setNow(value: string) {
      now = new Date(value);
    }
  };
}

test('restore preparation validates size and fingerprint before creating managed directories', async (context) => {
  const fixture = await preparationFixture(context);
  await assert.rejects(
    fixture.service.create({
      filename: 'backup.nvt',
      size: 0,
      fingerprint: validFingerprint(),
      replaceExisting: false
    }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'RESTORE_UPLOAD_INVALID'
  );
  await assert.rejects(
    fixture.service.create({
      filename: 'backup.nvt',
      size: RESTORE_UPLOAD_MAX_BYTES + 1,
      fingerprint: validFingerprint(),
      replaceExisting: false
    }),
    (error: unknown) => error instanceof BackupOperationError && error.status === 413
  );
  await assert.rejects(
    fixture.service.create({
      filename: 'backup.nvt',
      size: 1,
      fingerprint: 'sha256-partial-v1:ABC' as `sha256-partial-v1:${string}`,
      replaceExisting: false
    }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'RESTORE_FINGERPRINT_INVALID'
  );
  assert.deepEqual(await fixture.files.listManagedPaths(), []);
});

test('restore preparation creates one tokenized session and replacement invalidates old data', async (context) => {
  const fixture = await preparationFixture(context);
  const first = await fixture.service.create({
    filename: '../../unsafe.nvt',
    size: 3,
    fingerprint: validFingerprint('c'),
    replaceExisting: false
  });
  assert.equal(first.sessionId, 'session-1');
  assert.equal(first.receivedBytes, 0);
  assert.ok(first.sessionToken.length >= 40);
  assert.equal(
    fixture.repository.findRestoreSession(first.sessionId)?.originalFilename,
    'unsafe.nvt'
  );
  assert.notEqual(
    fixture.repository.findRestoreSession(first.sessionId)?.sessionTokenHash,
    first.sessionToken
  );

  await assert.rejects(
    fixture.service.create({
      filename: 'second.nvt',
      size: 3,
      fingerprint: validFingerprint('d'),
      replaceExisting: false
    }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'RESTORE_SESSION_EXISTS'
  );

  await writeFile(fixture.files.uploadArchivePath(first.sessionId), Buffer.from('old'));
  const second = await fixture.service.create({
    filename: 'second.nvt',
    size: 3,
    fingerprint: validFingerprint('d'),
    replaceExisting: true
  });
  assert.equal(second.sessionId, 'session-2');
  assert.equal(fixture.repository.findRestoreSession(first.sessionId)?.state, 'cancelled');
  assert.equal(existsSync(fixture.files.uploadRoot(first.sessionId)), false);
  assert.throws(
    () => fixture.service.read(first.sessionId, first.sessionToken),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'RESTORE_SESSION_TOKEN_INVALID'
  );
});

test('an active backup operation blocks restore session creation', async (context) => {
  const fixture = await preparationFixture(context);
  fixture.repository.createOperation({
    id: 'active-operation',
    idempotencyKey: 'active-key',
    requestFingerprint: 'active-fingerprint',
    kind: 'backup',
    mode: null,
    state: 'running',
    stage: 'archiving',
    cancellable: true,
    cancelRequestedAt: null,
    progressCurrent: 1,
    progressTotal: 3,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: null,
    result: null,
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z',
    finishedAt: null,
    metadataExpiresAt: '2026-08-01T00:00:00.000Z'
  });

  await assert.rejects(
    fixture.service.create({
      filename: 'backup.nvt',
      size: 3,
      fingerprint: validFingerprint(),
      replaceExisting: false
    }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'BACKUP_OPERATION_ACTIVE'
  );
});

test('sequential upload acknowledges durable offsets and supports lost-response resume', async (context) => {
  const fixture = await preparationFixture(context);
  const total = RESTORE_UPLOAD_CHUNK_BYTES + 3;
  const created = await fixture.service.create({
    filename: 'backup.nvt',
    size: total,
    fingerprint: validFingerprint(),
    replaceExisting: false
  });
  const first = Buffer.alloc(RESTORE_UPLOAD_CHUNK_BYTES, 7);
  assert.deepEqual(
    await fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: created.sessionToken,
      offset: 0,
      content: first
    }),
    {
      receivedBytes: RESTORE_UPLOAD_CHUNK_BYTES,
      expectedBytes: total,
      state: 'uploading'
    }
  );

  await assert.rejects(
    fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: created.sessionToken,
      offset: 0,
      content: first
    }),
    (error: unknown) =>
      error instanceof BackupOperationError &&
      error.code === 'OFFSET_MISMATCH' &&
      error.details?.expectedOffset === RESTORE_UPLOAD_CHUNK_BYTES
  );

  const final = await fixture.service.append({
    sessionId: created.sessionId,
    sessionToken: created.sessionToken,
    offset: RESTORE_UPLOAD_CHUNK_BYTES,
    content: Buffer.from('end')
  });
  assert.equal(final.receivedBytes, total);
  assert.equal(final.state, 'uploaded');
  assert.equal((await stat(fixture.files.uploadArchivePath(created.sessionId))).size, total);
});

test('upload rejects gaps, non-final short chunks, and wrong tokens without revealing state', async (context) => {
  const fixture = await preparationFixture(context);
  const created = await fixture.service.create({
    filename: 'backup.nvt',
    size: RESTORE_UPLOAD_CHUNK_BYTES + 2,
    fingerprint: validFingerprint(),
    replaceExisting: false
  });

  await assert.rejects(
    fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: created.sessionToken,
      offset: 1,
      content: Buffer.alloc(RESTORE_UPLOAD_CHUNK_BYTES)
    }),
    (error: unknown) => error instanceof BackupOperationError && error.code === 'OFFSET_MISMATCH'
  );
  await assert.rejects(
    fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: created.sessionToken,
      offset: 0,
      content: Buffer.from('short')
    }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'RESTORE_UPLOAD_INVALID'
  );
  await assert.rejects(
    fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: 'wrong-token',
      offset: 0,
      content: Buffer.alloc(RESTORE_UPLOAD_CHUNK_BYTES)
    }),
    (error: unknown) =>
      error instanceof BackupOperationError && error.code === 'RESTORE_SESSION_TOKEN_INVALID'
  );
  assert.equal(fixture.repository.findRestoreSession(created.sessionId)?.receivedBytes, 0);
});

test('concurrent same-offset appends write bytes once and leave authoritative state', async (context) => {
  const fixture = await preparationFixture(context);
  const created = await fixture.service.create({
    filename: 'backup.nvt',
    size: RESTORE_UPLOAD_CHUNK_BYTES + 1,
    fingerprint: validFingerprint(),
    replaceExisting: false
  });
  const chunk = Buffer.alloc(RESTORE_UPLOAD_CHUNK_BYTES, 3);
  const results = await Promise.allSettled([
    fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: created.sessionToken,
      offset: 0,
      content: chunk
    }),
    fixture.service.append({
      sessionId: created.sessionId,
      sessionToken: created.sessionToken,
      offset: 0,
      content: chunk
    })
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(
    fixture.repository.findRestoreSession(created.sessionId)?.receivedBytes,
    RESTORE_UPLOAD_CHUNK_BYTES
  );
  assert.equal(
    (await stat(fixture.files.uploadArchivePath(created.sessionId))).size,
    RESTORE_UPLOAD_CHUNK_BYTES
  );
});

test('public current is privacy-safe while authenticated reads extend only sliding expiry', async (context) => {
  const fixture = await preparationFixture(context);
  const created = await fixture.service.create({
    filename: 'backup.nvt',
    size: 3,
    fingerprint: validFingerprint(),
    replaceExisting: false
  });
  const before = fixture.repository.findRestoreSession(created.sessionId)!;
  const publicView = fixture.service.current()!;
  assert.equal('sessionTokenHash' in publicView, false);
  assert.equal('temporaryRoot' in publicView, false);
  assert.equal('fileFingerprint' in publicView, false);
  assert.equal(
    fixture.repository.findRestoreSession(created.sessionId)?.expiresAt,
    before.expiresAt
  );

  fixture.setNow('2026-07-25T00:10:00.000Z');
  const authenticated = fixture.service.read(created.sessionId, created.sessionToken);
  assert.equal(authenticated.expiresAt, '2026-07-25T00:40:00.000Z');
  assert.equal('archiveChecksum' in authenticated, false);
  assert.equal('sessionTokenHash' in authenticated, false);
});

test('startup upload reconciliation truncates unacknowledged tails and invalidates truncation', async (context) => {
  const fixture = await preparationFixture(context);
  const created = await fixture.service.create({
    filename: 'backup.nvt',
    size: 10,
    fingerprint: validFingerprint(),
    replaceExisting: false
  });
  fixture.repository.updateRestoreSession(created.sessionId, { receivedBytes: 5 });
  await writeFile(fixture.files.uploadArchivePath(created.sessionId), Buffer.from('12345678'));
  await fixture.service.reconcileUpload();
  assert.equal((await stat(fixture.files.uploadArchivePath(created.sessionId))).size, 5);

  await fixture.files.truncateUpload(created.sessionId, 2);
  await fixture.service.reconcileUpload();
  assert.equal(fixture.repository.findRestoreSession(created.sessionId)?.state, 'invalid');
  assert.equal(existsSync(fixture.files.uploadRoot(created.sessionId)), false);
});

test('startup cleanup removes orphan upload and inspection roots without deleting a valid ready session', async (context) => {
  const fixture = await createBackupControlFixture(context);
  const files = new NodeBackupFileStore(fixture.root);
  await files.initialize();
  fixture.repository.createRestoreSession(
    sessionInput('ready-session', {
      state: 'ready',
      stage: 'ready',
      expectedBytes: 3,
      receivedBytes: 3,
      archiveChecksum: 'a'.repeat(64),
      encrypted: false
    })
  );
  await files.initializeSession('ready-session');
  await files.initializeSession('orphan-session');
  await writeFile(files.uploadArchivePath('orphan-session'), Buffer.from('orphan'));
  await mkdir(files.validatedRoot('orphan-session'), { recursive: true });
  await writeFile(files.validatedPath('orphan-session', 'database.sqlite'), Buffer.from('db'));

  const cleanup = new BackupCleanupService(fixture.repository, files, {
    clock: { now: () => new Date('2026-07-25T00:10:00.000Z') }
  });
  const result = await cleanup.run();

  assert.equal(result.sessionRootsDeleted, 1);
  assert.equal(existsSync(files.uploadRoot('orphan-session')), false);
  assert.equal(existsSync(files.inspectionRoot('orphan-session')), false);
  assert.equal(existsSync(files.uploadRoot('ready-session')), true);
  assert.equal(existsSync(files.inspectionRoot('ready-session')), true);
  assert.equal(fixture.repository.findRestoreSession('ready-session')?.state, 'ready');
});
