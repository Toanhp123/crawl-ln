import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { BackupOperationSummary } from '@novel-tool/shared';
import { apiRuntime } from '../contract/api.runtime.ts';
import { withContractServer } from '../contract/http-server.harness.ts';
import { BackupController } from '../../apps/api/src/modules/backup/presentation/backup.controller.ts';
import { createBackupRoutes } from '../../apps/api/src/modules/backup/presentation/backup.routes.ts';
import { RestoreSessionController } from '../../apps/api/src/modules/backup/presentation/restore-session.controller.ts';
import { createRestoreSessionRoutes } from '../../apps/api/src/modules/backup/presentation/restore-session.routes.ts';
import { errorMiddleware } from '../../apps/api/src/platform/http/error.middleware.ts';
import { BackupOperationError } from '../../apps/api/src/modules/backup/application/errors/backup.error.ts';
import type { BackupApi } from '../../apps/api/src/modules/backup/public/backup.api.ts';
import { toBackupOperationSummary } from '../../apps/api/src/modules/backup/presentation/backup-operation.presenter.ts';
import type { BackupOperationRecord } from '../../apps/api/src/modules/backup/domain/backup-operation.models.ts';

async function json(response: Response) {
  return response.json() as Promise<{
    data: unknown;
    error: null | { code: string; message: string; details: unknown };
  }>;
}

async function waitForTerminal(
  baseUrl: string,
  operationId: string
): Promise<BackupOperationSummary> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/backups/operations/${operationId}`);
    const body = await json(response);
    const operation = body.data as BackupOperationSummary;
    if (!['queued', 'running'].includes(operation.state)) return operation;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Operation ${operationId} did not finish`);
}

function operation(overrides: Partial<BackupOperationRecord> = {}): BackupOperationRecord {
  return {
    id: 'operation-active',
    idempotencyKey: 'request-active',
    requestFingerprint: 'fingerprint-active',
    kind: 'backup',
    mode: null,
    state: 'running',
    stage: 'archiving',
    cancellable: true,
    cancelRequestedAt: null,
    progressCurrent: 2,
    progressTotal: 3,
    errorCode: null,
    errorDetails: null,
    resultArtifactId: null,
    safetyArtifactId: null,
    result: null,
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:01:00.000Z',
    finishedAt: null,
    metadataExpiresAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

async function withControllerServer(api: BackupApi, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/backups', createBackupRoutes(new BackupController(api)));
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

async function withRestoreStartServer(
  start: (input: Record<string, unknown>) => BackupOperationRecord,
  run: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use(express.json());
  const controller = new RestoreSessionController(
    {} as never,
    {} as never,
    {} as never,
    { start } as never
  );
  app.use('/api/backups/restore-sessions', createRestoreSessionRoutes(controller));
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test('backup operation HTTP contract validates starts and preserves idempotency without comparing passwords', async () => {
  await withContractServer(apiRuntime, async (baseUrl) => {
    const missingKey = await fetch(`${baseUrl}/api/backups/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'backup',
        encryption: { enabled: false },
        confirmation: { unencryptedAccepted: true },
        settings: {}
      })
    });
    assert.equal(missingKey.status, 400);
    assert.equal((await json(missingKey)).error?.code, 'VALIDATION_ERROR');

    const shortPassword = await fetch(`${baseUrl}/api/backups/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'short-password' },
      body: JSON.stringify({
        kind: 'backup',
        encryption: { enabled: true, password: '1234567' },
        confirmation: { unencryptedAccepted: false },
        settings: {}
      })
    });
    assert.equal(shortPassword.status, 422);
    assert.equal((await json(shortPassword)).error?.code, 'BACKUP_PASSWORD_TOO_SHORT');

    const missingConfirmation = await fetch(`${baseUrl}/api/backups/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'missing-confirmation' },
      body: JSON.stringify({
        kind: 'backup',
        encryption: { enabled: false },
        confirmation: { unencryptedAccepted: false },
        settings: {}
      })
    });
    assert.equal(missingConfirmation.status, 422);
    assert.equal(
      (await json(missingConfirmation)).error?.code,
      'BACKUP_UNENCRYPTED_CONFIRMATION_REQUIRED'
    );

    const key = 'encrypted-idempotent';
    const request = (password: string) =>
      fetch(`${baseUrl}/api/backups/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          kind: 'backup',
          encryption: { enabled: true, password },
          confirmation: { unencryptedAccepted: false },
          settings: { theme: 'dark' }
        })
      });
    const first = await request('exact password one');
    assert.equal(first.status, 202);
    const firstOperation = (await json(first)).data as BackupOperationSummary;
    assert.equal(firstOperation.state, 'queued');
    assert.equal(firstOperation.progress.total, 4);

    const replay = await request('different password two');
    assert.equal(replay.status, 202);
    assert.equal(((await json(replay)).data as BackupOperationSummary).id, firstOperation.id);

    const current = await fetch(`${baseUrl}/api/backups/operations/current`);
    assert.equal(current.status, 200);
    assert.equal(
      ((await json(current)).data as { operation: BackupOperationSummary }).operation.id,
      firstOperation.id
    );

    const read = await fetch(`${baseUrl}/api/backups/operations/${firstOperation.id}`);
    assert.equal(read.status, 200);
    assert.equal(((await json(read)).data as BackupOperationSummary).id, firstOperation.id);
    await waitForTerminal(baseUrl, firstOperation.id);
  });
});

test('Restore operation start requires both headers and returns 202 without secrets', async () => {
  const captured: Array<Record<string, unknown>> = [];
  await withRestoreStartServer(
    (input) => {
      captured.push(input);
      return operation({
        id: 'restore-operation-http',
        kind: 'restore',
        mode: 'replace',
        state: 'queued',
        stage: 'queued',
        progressCurrent: 0,
        progressTotal: 8
      });
    },
    async (baseUrl) => {
      const url = `${baseUrl}/api/backups/restore-sessions/session-http/restore`;
      const body = {
        inspectionToken: 'inspection-secret',
        planFingerprint: `sha256-plan-v1:${'a'.repeat(64)}`,
        confirmation: { accepted: true, typedPhrase: 'THAY THẾ DỮ LIỆU' },
        currentSettings: { theme: 'dark' }
      };

      const missingSessionToken = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'restore-http' },
        body: JSON.stringify(body)
      });
      assert.equal(missingSessionToken.status, 400);

      const missingIdempotency = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Session-Token': 'session-secret' },
        body: JSON.stringify(body)
      });
      assert.equal(missingIdempotency.status, 400);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Session-Token': 'session-secret',
          'Idempotency-Key': 'restore-http'
        },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 202);
      const payload = (await json(response)).data as BackupOperationSummary;
      assert.equal(payload.id, 'restore-operation-http');
      assert.equal(payload.kind, 'restore');
      assert.equal(payload.mode, 'replace');
      assert.equal(payload.progress.total, 8);
      assert.doesNotMatch(
        JSON.stringify(payload),
        /inspection-secret|session-secret|THAY THẾ DỮ LIỆU|theme|dark/
      );
      assert.deepEqual(captured, [
        {
          sessionId: 'session-http',
          sessionToken: 'session-secret',
          inspectionToken: 'inspection-secret',
          planFingerprint: body.planFingerprint,
          idempotencyKey: 'restore-http',
          confirmation: body.confirmation,
          currentSettings: body.currentSettings
        }
      ]);
    }
  );
});

test('Restore operation summaries expose only safe impact and settings outcomes', () => {
  const impact = {
    novelsNew: 2,
    novelsExisting: 1,
    chaptersAdded: 4,
    chaptersSkipped: 3,
    sourceRemaps: 1,
    tasksRestored: 2,
    schedulerPoliciesRestored: 1,
    searchDocumentsRebuilt: 6,
    settingsOutcome: 'use-backup' as const
  };
  const summary = toBackupOperationSummary(
    operation({
      kind: 'restore',
      mode: 'merge',
      state: 'succeeded',
      stage: 'succeeded',
      cancellable: false,
      progressCurrent: 9,
      progressTotal: 9,
      safetyArtifactId: 'safety-artifact-safe',
      result: {
        restoreMode: 'merge',
        settingsPolicy: 'use-backup',
        impact,
        settingsPending: true,
        currentSettings: { theme: 'secret-dark' },
        inspectionToken: 'secret-inspection',
        databasePath: 'C:/private/data.sqlite'
      },
      finishedAt: '2026-07-25T00:02:00.000Z'
    })
  );

  assert.deepEqual(summary.result, {
    restoreMode: 'merge',
    settingsPolicy: 'use-backup',
    impact,
    settingsPending: true,
    safetyArtifactId: 'safety-artifact-safe'
  });
  assert.doesNotMatch(
    JSON.stringify(summary),
    /secret-dark|secret-inspection|databasePath|private\/data/
  );
});

test('successful backup issues one-use download tokens and streams private artifacts', async () => {
  await withContractServer(apiRuntime, async (baseUrl) => {
    const startedResponse = await fetch(`${baseUrl}/api/backups/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'download-contract' },
      body: JSON.stringify({
        kind: 'backup',
        encryption: { enabled: false },
        confirmation: { unencryptedAccepted: true },
        settings: {}
      })
    });
    const started = (await json(startedResponse)).data as BackupOperationSummary;
    const finished = await waitForTerminal(baseUrl, started.id);
    assert.equal(finished.state, 'succeeded');
    assert.ok(finished.result?.artifactId);
    assert.ok(finished.result?.filename);

    const tokenResponse = await fetch(
      `${baseUrl}/api/backups/operations/${started.id}/download-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: finished.result.artifactId })
      }
    );
    assert.equal(tokenResponse.status, 200);
    const issued = (await json(tokenResponse)).data as { token: string; expiresAt: string };
    assert.equal(typeof issued.token, 'string');
    assert.ok(issued.token.length > 20);
    assert.equal(JSON.stringify(issued).includes('path'), false);

    const download = await fetch(`${baseUrl}/api/backups/downloads/${issued.token}`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/vnd.novel-tool.backup');
    assert.match(download.headers.get('content-disposition') ?? '', /attachment;/);
    const content = new Uint8Array(await download.arrayBuffer());
    assert.equal(Number(download.headers.get('content-length')), content.byteLength);
    assert.ok(content.byteLength > 0);
    assert.doesNotMatch(JSON.stringify([...download.headers]), /backup-control|artifacts[\\/]/i);

    const reused = await fetch(`${baseUrl}/api/backups/downloads/${issued.token}`);
    assert.equal(reused.status, 410);
    assert.equal((await json(reused)).error?.code, 'BACKUP_DOWNLOAD_TOKEN_INVALID');
  });
});

test('legacy synchronous Restore endpoint is no longer mounted', async () => {
  await withContractServer(apiRuntime, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/backups/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array([1, 2, 3])
    });
    assert.equal(response.status, 404);
  });
});

test('coded active conflicts and cancellation responses keep exact operation contracts', async () => {
  const active = operation();
  const cancelled = operation({
    state: 'running',
    stage: 'archiving',
    cancelRequestedAt: '2026-07-25T00:02:00.000Z'
  });
  const api = {
    commands: {
      create: async () => {
        throw new Error('unused');
      }
    },
    operations: {
      startBackup() {
        throw new BackupOperationError(
          'BACKUP_OPERATION_ACTIVE',
          409,
          'Another backup or restore operation is already running',
          true,
          {
            operation: {
              id: active.id,
              kind: active.kind,
              mode: active.mode,
              state: active.state,
              stage: active.stage,
              cancellable: active.cancellable,
              progress: { current: active.progressCurrent, total: active.progressTotal },
              startedAt: active.startedAt,
              updatedAt: active.updatedAt,
              finishedAt: active.finishedAt,
              error: null,
              result: null
            }
          }
        );
      },
      startRestore() {
        throw new Error('unused');
      },
      current: () => active,
      read: () => active,
      cancel: () => cancelled,
      issueDownloadToken: async () => ({ token: 'unused', expiresAt: '2026-07-25T00:10:00.000Z' }),
      acceptDownloadToken() {
        throw new BackupOperationError(
          'BACKUP_DOWNLOAD_TOKEN_INVALID',
          410,
          'Backup download token is invalid or expired',
          false
        );
      }
    }
  } satisfies BackupApi;

  await withControllerServer(api, async (baseUrl) => {
    const conflict = await fetch(`${baseUrl}/api/backups/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'conflict' },
      body: JSON.stringify({
        kind: 'backup',
        encryption: { enabled: false },
        confirmation: { unencryptedAccepted: true },
        settings: {}
      })
    });
    assert.equal(conflict.status, 409);
    const conflictBody = await json(conflict);
    assert.equal(conflictBody.error?.code, 'BACKUP_OPERATION_ACTIVE');
    assert.equal(
      (conflictBody.error?.details as { operation: BackupOperationSummary }).operation.id,
      active.id
    );

    const cancel = await fetch(`${baseUrl}/api/backups/operations/${active.id}/cancel`, {
      method: 'POST'
    });
    assert.equal(cancel.status, 200);
    assert.equal(((await json(cancel)).data as BackupOperationSummary).id, active.id);

    const expired = await fetch(`${baseUrl}/api/backups/downloads/expired-token`);
    assert.equal(expired.status, 410);
    assert.equal((await json(expired)).error?.code, 'BACKUP_DOWNLOAD_TOKEN_INVALID');
  });
});
