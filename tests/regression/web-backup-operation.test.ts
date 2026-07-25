import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  backupFallbackInterval,
  backupOperationKeys
} from '../../apps/web/src/entities/backup-operation/index.ts';
import {
  createBackupIdempotencyKey,
  operationFromActiveConflictDetails,
  validateBackupCreateForm,
  validateBackupOperation,
  validateCurrentBackupOperation
} from '../../apps/web/src/features/backup-library/model/backup-operation-validation.ts';

const operation = {
  id: 'operation-1',
  kind: 'backup' as const,
  mode: null,
  state: 'running' as const,
  stage: 'archiving',
  cancellable: true,
  progress: { current: 2, total: 3 },
  startedAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:01:00.000Z',
  finishedAt: null,
  error: null,
  result: null
};

test('backup fallback polling follows realtime connection and operation activity', () => {
  assert.equal(backupFallbackInterval('connected', operation, true), false);
  assert.equal(backupFallbackInterval('disconnected', operation, true), 1_000);
  assert.equal(
    backupFallbackInterval('connecting', { ...operation, state: 'succeeded' }, true),
    15_000
  );
  assert.equal(backupFallbackInterval(undefined, null, true), 15_000);
  assert.equal(backupFallbackInterval('disconnected', operation, false), false);
});

test('backup idempotency keys work with UUID, random bytes, and no Web Crypto', () => {
  assert.equal(createBackupIdempotencyKey({ randomUUID: () => 'uuid-key' }), 'uuid-key');
  assert.equal(
    createBackupIdempotencyKey({
      getRandomValues(bytes) {
        bytes.fill(15);
        return bytes;
      }
    }),
    '0f'.repeat(16)
  );
  assert.match(createBackupIdempotencyKey(null), /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
});

test('backup operation validators reject malformed or unsafe payloads', () => {
  assert.deepEqual(validateBackupOperation(operation), operation);
  assert.deepEqual(validateCurrentBackupOperation({ operation }), { operation });
  assert.throws(() =>
    validateBackupOperation({ ...operation, progress: { current: 4, total: 3 } })
  );
  const restoreResult = {
    restoreMode: 'replace' as const,
    settingsPolicy: 'keep-current' as const,
    settingsPending: false,
    safetyArtifactId: 'safety-artifact-1',
    expiresAt: '2026-07-26T00:00:00.000Z',
    impact: {
      novelsNew: 0,
      novelsExisting: 0,
      chaptersAdded: 0,
      chaptersSkipped: 0,
      sourceRemaps: 0,
      tasksRestored: 0,
      schedulerPoliciesRestored: 0,
      searchDocumentsRebuilt: 0,
      settingsOutcome: 'keep-current' as const,
      replaceAll: true as const,
      novelsTotal: 5,
      chaptersTotal: 20,
      tasksTotal: 2,
      schedulerPoliciesTotal: 1,
      searchDocumentsTotal: 25
    }
  };
  assert.deepEqual(
    validateBackupOperation({
      ...operation,
      kind: 'restore',
      mode: 'replace',
      state: 'succeeded',
      cancellable: false,
      result: restoreResult
    }).result,
    restoreResult
  );
  assert.throws(() => validateBackupOperation({ ...operation, result: { path: 'private/file' } }));
  assert.throws(() => validateBackupOperation({ ...operation, state: 'executing-shell' }));
  assert.deepEqual(operationFromActiveConflictDetails({ operation }), operation);
  assert.equal(
    operationFromActiveConflictDetails({ operation: { ...operation, token: 'secret' } }),
    null
  );
});

test('backup form validation preserves exact password semantics and unencrypted consent', () => {
  assert.equal(
    validateBackupCreateForm({
      encryptionEnabled: true,
      password: ' 123456 ',
      confirmationPassword: ' 123456 ',
      unencryptedAccepted: false
    }),
    null
  );
  assert.equal(
    validateBackupCreateForm({
      encryptionEnabled: true,
      password: 'password',
      confirmationPassword: 'password ',
      unencryptedAccepted: false
    }),
    'password-mismatch'
  );
  assert.equal(
    validateBackupCreateForm({
      encryptionEnabled: false,
      password: '',
      confirmationPassword: '',
      unencryptedAccepted: false
    }),
    'unencrypted-confirmation-required'
  );
});

test('operation query namespace is isolated and download tokens are never cached', async () => {
  assert.deepEqual(backupOperationKeys.all, ['backup-operation']);
  assert.deepEqual(backupOperationKeys.current(), ['backup-operation', 'current']);
  assert.deepEqual(backupOperationKeys.detail('operation-1'), [
    'backup-operation',
    'detail',
    'operation-1'
  ]);

  const hook = await readFile(
    'apps/web/src/features/backup-library/model/use-backup-operation.ts',
    'utf8'
  );
  assert.match(hook, /issueBackupDownloadToken/);
  assert.match(hook, /downloadBackupToken\(issued\.token/);
  assert.doesNotMatch(
    hook,
    /setQueryData[^\n]*(token|issued)|localStorage|sessionStorage|toast\(/i
  );
});

test('backup progress UI is stage-based and never renders fake percentage progress', async () => {
  const progress = await readFile(
    'apps/web/src/features/backup-library/ui/BackupOperationProgress.tsx',
    'utf8'
  );
  assert.match(progress, /backup\.progressStep/);
  assert.match(progress, /operation\.progress\.total > 0/);
  assert.match(progress, /backup\.closeDoesNotCancel/);
  assert.match(progress, /const active =/);
  assert.match(progress, /active && operation\.cancellable/);
  assert.doesNotMatch(progress, /%|ProgressBar|progressbar|width:\s*.*progress/i);
});

test('active-operation conflicts keep the server-confirmed operation in cache', async () => {
  const hook = await readFile(
    'apps/web/src/features/backup-library/model/use-backup-operation.ts',
    'utf8'
  );
  const onError = hook.match(
    /onError:\s*async?\s*\(error\)\s*=>\s*\{[\s\S]*?\r?\n\s*\}\r?\n\s*\}\);/
  )?.[0];
  assert.ok(onError, 'start mutation onError handler must exist');
  assert.match(onError, /operationFromActiveConflictDetails\(error\.details\)/);
  assert.match(onError, /if \(operation\) setCurrent\(operation\)/);
  assert.doesNotMatch(
    onError,
    /invalidateQueries/,
    'the conflict payload must not be overwritten by an immediate current-query refetch'
  );
});
