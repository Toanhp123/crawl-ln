import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiError } from '../../apps/web/src/shared/api/errors.ts';
import { createRestorePreparationClient } from '../../apps/web/src/features/backup-library/api/backup-library.ts';
import { computeRestoreFileFingerprint } from '../../apps/web/src/features/backup-library/model/file-fingerprint.ts';
import { uploadRestoreFile } from '../../apps/web/src/features/backup-library/model/resumable-upload.ts';
import {
  RESTORE_STORAGE_KEY,
  clearStoredRestoreSession,
  readStoredRestoreSession,
  writeStoredRestoreSession,
  type RestoreSessionStorage
} from '../../apps/web/src/features/backup-library/model/restore-session-storage.ts';
import {
  createRestoreWizardState,
  restoreWizardReducer
} from '../../apps/web/src/features/backup-library/model/restore-wizard-state.ts';
import {
  validateRestorePasswordFailure,
  validateRestorePlanResponse,
  validateRestoreSessionDetail
} from '../../apps/web/src/features/backup-library/model/backup-operation-validation.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function expectedFingerprint(bytes: Uint8Array): string {
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(bytes.byteLength));
  const range = 1024 * 1024;
  const first = bytes.subarray(0, Math.min(range, bytes.byteLength));
  const last = bytes.subarray(Math.max(0, bytes.byteLength - Math.min(range, bytes.byteLength)));
  return `sha256-partial-v1:${createHash('sha256')
    .update(Buffer.from('sha256-partial-v1\0'))
    .update(size)
    .update(first)
    .update(last)
    .digest('hex')}`;
}

const readySession = {
  id: 'restore-1',
  state: 'ready' as const,
  stage: 'ready',
  originalFilename: 'backup.nvt',
  expectedBytes: 10,
  receivedBytes: 10,
  expiresAt: '2026-07-25T01:00:00.000Z',
  absoluteExpiresAt: '2026-07-25T02:00:00.000Z',
  lockedOperationId: null,
  encrypted: false,
  passwordFailures: 0,
  attemptsRemaining: 5,
  inventory: {
    createdAt: '2026-07-25T00:00:00.000Z',
    appVersion: '3.0.0',
    schemaVersion: 2,
    archiveSizeBytes: 10,
    encrypted: false,
    library: { novels: 1, analyzedNovels: 1, chapters: 2, fetchedChapters: 2 },
    sources: { plugins: 1, credentials: 0, networkProfiles: 1 },
    ingestion: { tasks: 0, events: 0 },
    scheduler: { policies: 0, diagnostics: 0 },
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
  },
  mergePlan: null,
  mergePlanFingerprint: null,
  selectedMode: null,
  settingsPolicy: null,
  inspectionToken: 'inspection_token_123456'
};

test('partial file fingerprint matches the server layout and includes overlapping small ranges', async () => {
  const smallBytes = Uint8Array.from({ length: 97 }, (_, index) => index % 251);
  const small = new File([smallBytes], 'small.nvt');
  assert.equal(await computeRestoreFileFingerprint(small), expectedFingerprint(smallBytes));

  const largeBytes = new Uint8Array(2 * 1024 * 1024 + 31);
  largeBytes[0] = 17;
  largeBytes[largeBytes.length - 1] = 99;
  const large = new File([largeBytes], 'large.nvt');
  assert.equal(await computeRestoreFileFingerprint(large), expectedFingerprint(largeBytes));
});

test('resumable upload advances only from acknowledged offsets and recovers mismatch and one network loss', async () => {
  const chunk = 8 * 1024 * 1024;
  const bytes = new Uint8Array(chunk * 2 + 3);
  const file = new File([bytes], 'backup.nvt');
  const appendOffsets: number[] = [];
  const progress: number[] = [];
  let calls = 0;
  let statusReads = 0;

  const result = await uploadRestoreFile(
    {
      file,
      session: {
        id: 'restore-1',
        token: 'session-token',
        receivedBytes: 0,
        expectedBytes: file.size
      },
      onAcknowledgedProgress(value) {
        progress.push(value);
      },
      signal: new AbortController().signal
    },
    {
      async append(input) {
        appendOffsets.push(input.offset);
        calls += 1;
        if (calls === 1) {
          throw new ApiError('offset changed', {
            status: 409,
            code: 'OFFSET_MISMATCH',
            details: { receivedBytes: chunk }
          });
        }
        if (calls === 2) throw new TypeError('network lost after server ACK');
        return { receivedBytes: file.size, expectedBytes: file.size, state: 'uploaded' as const };
      },
      async read() {
        statusReads += 1;
        return {
          ...readySession,
          state: 'uploading' as const,
          expectedBytes: file.size,
          receivedBytes: chunk * 2
        };
      }
    }
  );

  assert.deepEqual(appendOffsets, [0, chunk, chunk * 2]);
  assert.deepEqual(progress, [chunk, chunk * 2, file.size]);
  assert.equal(statusReads, 1);
  assert.equal(result.receivedBytes, file.size);
});

test('resumable upload aborts without issuing cancel or speculative progress', async () => {
  const controller = new AbortController();
  controller.abort();
  let appended = false;
  let read = false;
  await assert.rejects(
    () =>
      uploadRestoreFile(
        {
          file: new File([new Uint8Array([1])], 'backup.nvt'),
          session: { id: 'restore-1', token: 'token', receivedBytes: 0, expectedBytes: 1 },
          onAcknowledgedProgress() {
            assert.fail('aborted upload must not report progress');
          },
          signal: controller.signal
        },
        {
          async append() {
            appended = true;
            throw new Error('unexpected append');
          },
          async read() {
            read = true;
            return readySession;
          }
        }
      ),
    /abort/i
  );
  assert.equal(appended, false);
  assert.equal(read, false);
});

test('restore session storage is versioned, tab-scoped, rejects malformed data, and stores no passwords', () => {
  const storage = new MemoryStorage();
  const value: RestoreSessionStorage = {
    version: 1,
    sessionId: 'restore-1',
    sessionToken: 'session_token_123456',
    inspectionToken: 'inspection_token_123456',
    step: 'impact',
    fingerprint: `sha256-partial-v1:${'a'.repeat(64)}`,
    filename: 'backup.nvt',
    size: 12,
    pendingSettings: { theme: 'dark' }
  };
  writeStoredRestoreSession(value, storage);
  assert.deepEqual(readStoredRestoreSession(storage), value);
  assert.doesNotMatch(storage.getItem(RESTORE_STORAGE_KEY) ?? '', /password|downloadToken/i);

  storage.setItem(RESTORE_STORAGE_KEY, JSON.stringify({ ...value, password: 'secret' }));
  assert.equal(readStoredRestoreSession(storage), null);
  assert.equal(storage.getItem(RESTORE_STORAGE_KEY), null);
  assert.throws(() =>
    writeStoredRestoreSession(
      { ...value, pendingSettings: { nested: { downloadToken: 'secret' } } },
      storage
    )
  );

  writeStoredRestoreSession(value, storage);
  clearStoredRestoreSession(storage);
  assert.equal(storage.getItem(RESTORE_STORAGE_KEY), null);
});

test('restore wizard reducer follows authoritative session and operation states', () => {
  let state = createRestoreWizardState();
  state = restoreWizardReducer(state, {
    type: 'restore-storage',
    value: {
      version: 1,
      sessionId: 'restore-1',
      sessionToken: 'session_token_123456',
      step: 'inventory'
    }
  });
  state = restoreWizardReducer(state, { type: 'session-loaded', session: readySession });
  assert.equal(state.step, 'inventory');

  state = restoreWizardReducer(state, { type: 'inventory-reviewed' });
  assert.equal(state.step, 'options');
  state = restoreWizardReducer(state, { type: 'back' });
  assert.equal(state.step, 'inventory');

  state = restoreWizardReducer(state, {
    type: 'operation-loaded',
    operation: { id: 'operation-1', state: 'running' }
  });
  assert.equal(state.step, 'progress');
  assert.equal(restoreWizardReducer(state, { type: 'back' }).step, 'progress');

  state = restoreWizardReducer(state, {
    type: 'operation-loaded',
    operation: { id: 'operation-1', state: 'succeeded' }
  });
  assert.equal(state.step, 'result');

  state = restoreWizardReducer(state, {
    type: 'session-loaded',
    session: { ...readySession, state: 'expired' }
  });
  assert.equal(state.step, 'choose-file');
  assert.equal(state.sessionToken, null);
  assert.equal(state.inspectionToken, null);

  state = restoreWizardReducer(createRestoreWizardState(), {
    type: 'session-loaded',
    session: { ...readySession, state: 'awaiting-password' }
  });
  assert.equal(state.step, 'upload-validate');

  state = restoreWizardReducer(
    { ...createRestoreWizardState(), step: 'confirmation' },
    { type: 'plan-stale' }
  );
  assert.equal(state.step, 'impact');
});

test('restore response validators reject private paths, negative counts, and malformed plan secrets', () => {
  assert.deepEqual(validateRestoreSessionDetail(readySession), readySession);
  assert.throws(() =>
    validateRestoreSessionDetail({ ...readySession, temporaryRoot: '/tmp/private' })
  );
  assert.throws(() =>
    validateRestoreSessionDetail({
      ...readySession,
      inventory: {
        ...readySession.inventory,
        library: { ...readySession.inventory.library, novels: -1 }
      }
    })
  );
  assert.deepEqual(validateRestorePasswordFailure({ attemptsRemaining: 4 }), {
    attemptsRemaining: 4
  });
  assert.throws(() => validateRestorePasswordFailure({ attemptsRemaining: -1 }));
  assert.throws(() =>
    validateRestorePlanResponse({
      ...readySession,
      plan: {
        mode: 'merge',
        settingsPolicy: 'keep-current',
        archiveChecksum: 'a'.repeat(64),
        targetFingerprint: 'b'.repeat(64),
        contributorImpact: {},
        impact: {
          novelsNew: 0,
          novelsExisting: 0,
          chaptersAdded: 0,
          chaptersSkipped: 0,
          sourceRemaps: 0,
          tasksRestored: 0,
          schedulerPoliciesRestored: 0,
          searchDocumentsRebuilt: 0,
          settingsOutcome: 'keep-current'
        },
        createdAt: '2026-07-25T00:00:00.000Z'
      },
      planFingerprint: `sha256-plan-v1:${'c'.repeat(64)}`,
      inspectionToken: 'short',
      pendingSettings: null
    })
  );
});

test('restore preparation client preserves endpoint, token, offset, and plan request contracts', async () => {
  const requests: Array<{ path: string; init: RequestInit }> = [];
  const responseData = [
    {
      sessionId: 'restore-1',
      sessionToken: 'session_token_123456',
      receivedBytes: 0,
      expiresAt: '2026-07-25T01:00:00.000Z',
      absoluteExpiresAt: '2026-07-25T02:00:00.000Z'
    },
    { receivedBytes: 3, expectedBytes: 3, state: 'uploaded' },
    {
      ...readySession,
      plan: {
        mode: 'merge',
        settingsPolicy: 'keep-current',
        archiveChecksum: 'a'.repeat(64),
        targetFingerprint: 'b'.repeat(64),
        contributorImpact: {},
        impact: {
          novelsNew: 0,
          novelsExisting: 1,
          chaptersAdded: 0,
          chaptersSkipped: 2,
          sourceRemaps: 0,
          tasksRestored: 0,
          schedulerPoliciesRestored: 0,
          searchDocumentsRebuilt: 2,
          settingsOutcome: 'keep-current'
        },
        createdAt: '2026-07-25T00:00:00.000Z'
      },
      planFingerprint: `sha256-plan-v1:${'c'.repeat(64)}`,
      inspectionToken: 'inspection_token_123456',
      pendingSettings: null
    }
  ];
  const client = createRestorePreparationClient(async (input, init = {}) => {
    requests.push({ path: new URL(String(input), 'http://test').pathname, init });
    return new Response(JSON.stringify({ data: responseData.shift(), error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  await client.create({
    filename: 'backup.nvt',
    size: 3,
    fingerprint: `sha256-partial-v1:${'d'.repeat(64)}`,
    replaceExisting: false
  });
  await client.append({
    id: 'restore-1',
    token: 'session_token_123456',
    offset: 0,
    content: new Blob([new Uint8Array([1, 2, 3])])
  });
  await client.plan({
    id: 'restore-1',
    token: 'session_token_123456',
    mode: 'merge',
    settingsPolicy: 'keep-current'
  });

  assert.deepEqual(
    requests.map(({ path, init }) => ({
      path,
      method: init.method,
      sessionToken: new Headers(init.headers).get('session-token'),
      uploadOffset: new Headers(init.headers).get('upload-offset'),
      body: typeof init.body === 'string' ? init.body : null
    })),
    [
      {
        path: '/api/backups/restore-sessions',
        method: 'POST',
        sessionToken: null,
        uploadOffset: null,
        body: JSON.stringify({
          filename: 'backup.nvt',
          size: 3,
          fingerprint: `sha256-partial-v1:${'d'.repeat(64)}`,
          replaceExisting: false
        })
      },
      {
        path: '/api/backups/restore-sessions/restore-1/chunk',
        method: 'PUT',
        sessionToken: 'session_token_123456',
        uploadOffset: '0',
        body: null
      },
      {
        path: '/api/backups/restore-sessions/restore-1/plan',
        method: 'POST',
        sessionToken: 'session_token_123456',
        uploadOffset: null,
        body: JSON.stringify({ mode: 'merge', settingsPolicy: 'keep-current' })
      }
    ]
  );
});

test('mounted restore hook owns visibility-bound heartbeat and the settings panel activates the wizard', async () => {
  const hook = await readFile(
    'apps/web/src/features/backup-library/model/use-restore-wizard.ts',
    'utf8'
  );
  const panel = await readFile(
    'apps/web/src/features/backup-library/ui/BackupLibraryPanel.tsx',
    'utf8'
  );
  assert.match(hook, /5\s*\*\s*60\s*\*\s*1_000|300_000/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /document\.visibilityState/);
  assert.match(hook, /touchRestoreSession/);
  assert.match(panel, /RestoreWizard/);
});
