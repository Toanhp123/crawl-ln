import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import type { BackupOperationSummary } from '@novel-tool/shared';
import { installE2eRuntime } from './runtime.fixture';

const envelope = (data: unknown) => JSON.stringify({ data, error: null });

function backupOperation(overrides: Partial<BackupOperationSummary> = {}): BackupOperationSummary {
  return {
    id: 'backup-operation-1',
    kind: 'backup',
    mode: null,
    state: 'running',
    stage: 'collecting',
    cancellable: true,
    progress: { current: 1, total: 4 },
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:01.000Z',
    finishedAt: null,
    error: null,
    result: null,
    ...overrides
  };
}

async function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: envelope(data)
  });
}

function backupDialog(page: Page): Locator {
  return page.getByRole('dialog').filter({ has: page.locator('[data-restore-wizard]') });
}

function restoreWizard(dialog: Locator): Locator {
  return dialog.locator('[data-restore-wizard]');
}

function dataBackupButton(page: Page): Locator {
  return page.getByRole('button', {
    name: /^(?:Data and backups|Dữ liệu và sao lưu)/
  });
}

async function prepareSettingsPage(page: Page): Promise<void> {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.setItem('novel-tool-language', 'en');
    localStorage.setItem('novel-tool-theme', 'light');
    localStorage.setItem('novel-tool-density', 'compact');
    localStorage.setItem('novel-tool-app-font', 'medium');
  });
  await page.goto('/settings');
}

async function openBackupPanelFromLoadedPage(page: Page): Promise<Locator> {
  await dataBackupButton(page).click();
  const dialog = backupDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openBackupPanel(page: Page): Promise<Locator> {
  await prepareSettingsPage(page);
  return openBackupPanelFromLoadedPage(page);
}

function trackSettingsDocumentNavigations(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (!request.isNavigationRequest()) return;
    if (request.resourceType() !== 'document') return;
    if (request.frame() !== page.mainFrame()) return;
    if (new URL(request.url()).pathname !== '/settings') return;
    urls.push(request.url());
  });
  return urls;
}

function startRoute() {
  return /\/api\/backups\/operations(?:\?.*)?$/;
}

test.describe('Backup operation', () => {
  test('requires the unencrypted warning before start', async ({ page }) => {
    let starts = 0;
    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation: null })
    );
    await page.route(startRoute(), async (route) => {
      starts += 1;
      await fulfillJson(route, backupOperation({ state: 'queued', stage: 'queued' }), 202);
    });
    await installE2eRuntime(page);

    const dialog = await openBackupPanel(page);
    await dialog.getByRole('checkbox', { name: 'Encrypt this backup' }).uncheck();
    await dialog.getByRole('button', { name: 'Create backup' }).click();

    await expect(dialog.getByRole('alert')).toContainText(
      'Accept the unencrypted-backup warning before continuing.'
    );
    expect(starts).toBe(0);
  });

  test('blocks encrypted password minimum-length and mismatch errors', async ({ page }) => {
    let starts = 0;
    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation: null })
    );
    await page.route(startRoute(), async (route) => {
      starts += 1;
      await fulfillJson(route, backupOperation({ state: 'queued', stage: 'queued' }), 202);
    });
    await installE2eRuntime(page);

    const dialog = await openBackupPanel(page);
    const password = dialog.getByLabel('Backup password');
    const confirmation = dialog.getByLabel('Confirm password');

    await password.fill('1234567');
    await confirmation.fill('1234567');
    await dialog.getByRole('button', { name: 'Create backup' }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'The backup password must contain at least 8 characters.'
    );

    await password.fill('12345678');
    await confirmation.fill('12345679');
    await dialog.getByRole('button', { name: 'Create backup' }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'The password confirmation does not match.'
    );
    expect(starts).toBe(0);
  });

  test('applies stage events while the Settings sheet stays open', async ({ page }) => {
    let current = backupOperation({
      state: 'queued',
      stage: 'queued',
      progress: { current: 0, total: 4 }
    });
    let currentRequests = 0;
    let releaseEvent!: () => void;
    const eventGate = new Promise<void>((resolve) => {
      releaseEvent = resolve;
    });
    let eventSent = false;

    await page.route('**/api/backups/operations/current', async (route) => {
      currentRequests += 1;
      await fulfillJson(route, { operation: current });
    });
    await page.route('**/api/events', async (route) => {
      if (eventSent) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await eventGate;
      eventSent = true;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        },
        body: `data: ${JSON.stringify({
          id: 'backup-stage-1',
          type: 'data.changed',
          resources: ['backup'],
          reason: 'backup.operation.stage-changed',
          occurredAt: new Date().toISOString()
        })}\n\n`
      });
    });
    await installE2eRuntime(page, { mockEvents: false });

    const dialog = await openBackupPanel(page);
    await expect(dialog).toContainText('Waiting to start');
    const before = currentRequests;
    current = backupOperation({ stage: 'archiving', progress: { current: 2, total: 4 } });
    releaseEvent();

    await expect.poll(() => currentRequests).toBeGreaterThan(before);
    await expect(dialog).toContainText('Creating the backup archive');
    await expect(dialog).toContainText('Step 2/4');
    await expect(dialog).toBeVisible();
  });

  test('reconnects to the same operation after closing and reopening the sheet', async ({
    page
  }) => {
    const current = backupOperation({ stage: 'archiving', progress: { current: 2, total: 4 } });
    let currentRequests = 0;
    await page.route('**/api/backups/operations/current', async (route) => {
      currentRequests += 1;
      await fulfillJson(route, { operation: current });
    });
    await installE2eRuntime(page);

    let dialog = await openBackupPanel(page);
    await expect(dialog).toContainText('Creating the backup archive');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: /^Data and backups/ }).click();
    dialog = backupDialog(page);
    await expect(dialog).toContainText('Creating the backup archive');
    expect(currentRequests).toBeGreaterThan(0);
  });

  test('uses active fallback polling while realtime is disconnected', async ({ page }) => {
    let currentRequests = 0;
    await page.route('**/api/backups/operations/current', async (route) => {
      currentRequests += 1;
      await fulfillJson(route, { operation: backupOperation() });
    });
    await installE2eRuntime(page);

    const dialog = await openBackupPanel(page);
    await expect(dialog).toContainText('Collecting application data');
    const initialRequests = currentRequests;
    await expect.poll(() => currentRequests, { timeout: 4_000 }).toBeGreaterThan(initialRequests);
  });

  test('issues a fresh token and downloads the completed nvt artifact', async ({ page }) => {
    const completed = backupOperation({
      state: 'succeeded',
      stage: 'succeeded',
      cancellable: false,
      progress: { current: 4, total: 4 },
      finishedAt: '2026-07-25T00:01:00.000Z',
      result: {
        filename: 'novel-tool-backup-e2e.nvt',
        sizeBytes: 4,
        encrypted: true,
        artifactId: 'artifact-1',
        expiresAt: '2099-07-26T00:00:00.000Z'
      }
    });
    let issuedTokens = 0;

    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation: completed })
    );
    await page.route('**/api/backups/operations/*/download-token', async (route) => {
      issuedTokens += 1;
      expect(route.request().postDataJSON()).toEqual({ artifactId: 'artifact-1' });
      await fulfillJson(route, {
        token: `download-token-${issuedTokens}`,
        expiresAt: '2099-07-25T00:10:00.000Z'
      });
    });
    await page.route('**/api/backups/downloads/*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/vnd.novel-tool.backup',
          'content-disposition': 'attachment; filename="novel-tool-backup-e2e.nvt"',
          'content-length': '4'
        },
        body: 'NVT!'
      });
    });
    await installE2eRuntime(page);

    const dialog = await openBackupPanel(page);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download backup' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('novel-tool-backup-e2e.nvt');
    expect(issuedTokens).toBe(1);
  });

  test('treats a second-operation conflict as synchronization', async ({ page }) => {
    const active = backupOperation({ stage: 'archiving', progress: { current: 2, total: 4 } });
    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation: null })
    );
    await page.route(startRoute(), async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          error: {
            code: 'BACKUP_OPERATION_ACTIVE',
            message: 'Another backup or restore operation is already running',
            details: { retryable: true, operation: active }
          }
        })
      });
    });
    await installE2eRuntime(page);

    const dialog = await openBackupPanel(page);
    const password = dialog.getByLabel('Backup password');
    const confirmation = dialog.getByLabel('Confirm password');
    await password.fill('exact password');
    await confirmation.fill('exact password');
    await dialog.getByRole('button', { name: 'Create backup' }).click();

    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog).toContainText('Another backup or restore is already running.');
    await expect(dialog).toContainText('Creating the backup archive');
    await expect(password).toHaveValue('exact password');
    await expect(confirmation).toHaveValue('exact password');
  });
});

type RestoreSessionFixture = ReturnType<typeof restoreSession>;

const restoreToken = 'session_token_e2e_123456';
const inspectionToken = 'inspection_token_e2e_123456';
const planFingerprint = `sha256-plan-v1:${'c'.repeat(64)}` as const;

function restoreInventory() {
  return {
    createdAt: '2026-07-25T00:00:00.000Z',
    appVersion: '3.0.0-e2e',
    schemaVersion: 2,
    archiveSizeBytes: 17 * 1024 * 1024,
    encrypted: false,
    library: { novels: 3, analyzedNovels: 2, chapters: 21, fetchedChapters: 18 },
    sources: { plugins: 2, credentials: 1, networkProfiles: 1 },
    ingestion: { tasks: 4, events: 12 },
    scheduler: { policies: 2, diagnostics: 1 },
    search: { indexedDocuments: 18 },
    settings: { groups: ['appearance', 'language', 'reader'], count: 3 }
  };
}

function restorePlan(mode: 'merge' | 'replace' = 'merge', settingsPolicy = 'keep-current') {
  return {
    mode,
    settingsPolicy: settingsPolicy as 'keep-current' | 'use-backup',
    archiveChecksum: 'a'.repeat(64),
    targetFingerprint: 'b'.repeat(64),
    contributorImpact: { library: { novels: 3, chapters: 21 } },
    impact: {
      novelsNew: mode === 'merge' ? 2 : 0,
      novelsExisting: mode === 'merge' ? 1 : 0,
      chaptersAdded: mode === 'merge' ? 18 : 0,
      chaptersSkipped: mode === 'merge' ? 3 : 0,
      sourceRemaps: mode === 'merge' ? 1 : 0,
      tasksRestored: 4,
      schedulerPoliciesRestored: 2,
      searchDocumentsRebuilt: 18,
      settingsOutcome: settingsPolicy as 'keep-current' | 'use-backup',
      ...(mode === 'replace'
        ? {
            replaceAll: true as const,
            novelsTotal: 3,
            chaptersTotal: 21,
            tasksTotal: 4,
            schedulerPoliciesTotal: 2,
            searchDocumentsTotal: 18
          }
        : {})
    },
    createdAt: '2026-07-25T00:00:00.000Z'
  };
}

function restoreSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'restore-session-1',
    state: 'ready' as const,
    stage: 'ready',
    originalFilename: 'library.nvt',
    expectedBytes: 17 * 1024 * 1024,
    receivedBytes: 17 * 1024 * 1024,
    expiresAt: '2099-07-25T01:00:00.000Z',
    absoluteExpiresAt: '2099-07-25T02:00:00.000Z',
    lockedOperationId: null,
    encrypted: false,
    passwordFailures: 0,
    attemptsRemaining: 5,
    inventory: restoreInventory(),
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
    inspectionToken: null,
    ...overrides
  };
}

function publicRestoreSession(session: RestoreSessionFixture) {
  return {
    id: session.id,
    state: session.state,
    stage: session.stage,
    originalFilename: session.originalFilename,
    expectedBytes: session.expectedBytes,
    receivedBytes: session.receivedBytes,
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    lockedOperationId: session.lockedOperationId
  };
}

function restoreOperation(overrides: Partial<BackupOperationSummary> = {}): BackupOperationSummary {
  return {
    id: 'restore-operation-1',
    kind: 'restore',
    mode: 'merge',
    state: 'running',
    stage: 'preparing',
    cancellable: true,
    progress: { current: 2, total: 5 },
    startedAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:01.000Z',
    finishedAt: null,
    error: null,
    result: null,
    ...overrides
  };
}

function partialFingerprint(content: Buffer): `sha256-partial-v1:${string}` {
  const range = 1024 * 1024;
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(content.length));
  const input = Buffer.concat([
    Buffer.from('sha256-partial-v1\0'),
    size,
    content.subarray(0, Math.min(range, content.length)),
    content.subarray(Math.max(0, content.length - range))
  ]);
  return `sha256-partial-v1:${createHash('sha256').update(input).digest('hex')}`;
}

async function seedRestoreStorage(
  page: Page,
  input: {
    session: RestoreSessionFixture;
    step?: string;
    fingerprint?: string;
    filename?: string;
    size?: number;
    operationId?: string;
    inspectionTokenValue?: string;
    pendingSettings?: Record<string, unknown>;
    mode?: 'merge' | 'replace';
    settingsPolicy?: 'keep-current' | 'use-backup';
    acknowledgedBytes?: number;
    replaceReloadedOperationId?: string;
  }
) {
  await page.addInitScript(
    (value) => {
      const RESTORE_STORAGE_KEY = 'novel-tool:backup-restore:v1';
      if (sessionStorage.getItem(RESTORE_STORAGE_KEY)) return;
      sessionStorage.setItem(RESTORE_STORAGE_KEY, JSON.stringify(value));
    },
    {
      version: 1,
      sessionId: input.session.id,
      sessionToken: restoreToken,
      step: input.step ?? 'upload-validate',
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
      ...(input.filename ? { filename: input.filename } : {}),
      ...(input.size ? { size: input.size } : {}),
      ...(input.operationId ? { operationId: input.operationId } : {}),
      ...(input.inspectionTokenValue ? { inspectionToken: input.inspectionTokenValue } : {}),
      ...(input.pendingSettings ? { pendingSettings: input.pendingSettings } : {}),
      ...(input.replaceReloadedOperationId
        ? { replaceReloadedOperationId: input.replaceReloadedOperationId }
        : {}),
      mode: input.mode ?? 'merge',
      settingsPolicy: input.settingsPolicy ?? 'keep-current',
      acknowledgedBytes: input.acknowledgedBytes ?? input.session.receivedBytes
    }
  );
}

type RestoreHarnessOptions = {
  session?: RestoreSessionFixture | null;
  operation?: BackupOperationSummary | null;
  completeSession?: RestoreSessionFixture;
  planResponse?: Record<string, unknown>;
  startOperation?: BackupOperationSummary;
  onRequest?: (
    route: Route,
    path: string,
    method: string,
    state: RestoreHarnessState
  ) => Promise<boolean>;
};

type RestoreHarnessState = {
  session: RestoreSessionFixture | null;
  operation: BackupOperationSummary | null;
  chunkOffsets: number[];
  restoreStarts: number;
};

async function installRestoreHarness(page: Page, options: RestoreHarnessOptions = {}) {
  const state: RestoreHarnessState = {
    session: options.session ?? null,
    operation: options.operation ?? null,
    chunkOffsets: [],
    restoreStarts: 0
  };

  await page.route('**/api/backups/operations/current', (route) =>
    fulfillJson(route, { operation: state.operation })
  );
  await page.route(/\/api\/backups\/restore-sessions(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (await options.onRequest?.(route, path, method, state)) return;

    if (path.endsWith('/current') && method === 'GET') {
      await fulfillJson(route, {
        session: state.session ? publicRestoreSession(state.session) : null
      });
      return;
    }
    if (path === '/api/backups/restore-sessions' && method === 'POST') {
      const body = request.postDataJSON() as { filename: string; size: number };
      state.session = restoreSession({
        state: 'uploading',
        stage: 'uploading',
        originalFilename: body.filename,
        expectedBytes: body.size,
        receivedBytes: 0,
        encrypted: null,
        inventory: null,
        compatibility: null
      });
      await fulfillJson(
        route,
        {
          sessionId: state.session.id,
          sessionToken: restoreToken,
          receivedBytes: 0,
          expiresAt: state.session.expiresAt,
          absoluteExpiresAt: state.session.absoluteExpiresAt
        },
        201
      );
      return;
    }
    if (path.endsWith('/chunk') && method === 'PUT') {
      const offset = Number(request.headers()['upload-offset']);
      state.chunkOffsets.push(offset);
      const length = request.postDataBuffer()?.byteLength ?? 0;
      state.session = restoreSession({
        ...state.session,
        state: offset + length >= (state.session?.expectedBytes ?? 0) ? 'uploaded' : 'uploading',
        stage: 'uploading',
        expectedBytes: state.session?.expectedBytes ?? 0,
        receivedBytes: offset + length,
        encrypted: null,
        inventory: null,
        compatibility: null
      });
      await fulfillJson(route, {
        receivedBytes: state.session.receivedBytes,
        expectedBytes: state.session.expectedBytes,
        state: state.session.state
      });
      return;
    }
    if (path.endsWith('/complete') && method === 'POST') {
      state.session =
        options.completeSession ??
        restoreSession({
          expectedBytes: state.session?.expectedBytes ?? 0,
          receivedBytes: state.session?.expectedBytes ?? 0
        });
      await fulfillJson(route, state.session);
      return;
    }
    if (path.endsWith('/unlock') && method === 'POST') {
      state.session = restoreSession({
        expectedBytes: state.session?.expectedBytes ?? 0,
        receivedBytes: state.session?.expectedBytes ?? 0
      });
      await fulfillJson(route, state.session);
      return;
    }
    if (path.endsWith('/plan') && method === 'POST') {
      const requestBody = request.postDataJSON() as {
        mode: 'merge' | 'replace';
        settingsPolicy: 'keep-current' | 'use-backup';
      };
      const plan = restorePlan(requestBody.mode, requestBody.settingsPolicy);
      state.session = restoreSession({
        ...state.session,
        mergePlan: plan,
        mergePlanFingerprint: planFingerprint,
        selectedMode: requestBody.mode,
        settingsPolicy: requestBody.settingsPolicy,
        inspectionToken
      });
      await fulfillJson(
        route,
        options.planResponse ?? {
          ...state.session,
          plan,
          planFingerprint,
          inspectionToken,
          pendingSettings:
            requestBody.settingsPolicy === 'use-backup'
              ? { 'novel-tool-theme': 'dark', 'novel-tool-language': 'vi' }
              : null
        }
      );
      return;
    }
    if (path.endsWith('/restore') && method === 'POST') {
      state.restoreStarts += 1;
      state.operation =
        options.startOperation ?? restoreOperation({ state: 'queued', stage: 'queued' });
      await fulfillJson(route, state.operation, 202);
      return;
    }
    if (method === 'DELETE') {
      state.session = state.session
        ? restoreSession({ ...state.session, state: 'cancelled' })
        : null;
      await fulfillJson(route, state.session);
      return;
    }
    if (method === 'POST' && path.endsWith('/touch')) {
      await fulfillJson(route, state.session);
      return;
    }
    if (method === 'GET') {
      await fulfillJson(route, state.session);
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
  await page.route('**/api/scheduler/status', (route) =>
    fulfillJson(route, {
      running: false,
      tickIntervalMs: 60_000,
      monitoredNovels: 0,
      dueNovels: 0,
      activeRuns: 0
    })
  );
  await installE2eRuntime(page);
  return state;
}

test.describe('Phase 2C Backup and Restore acceptance matrix', () => {
  test('1. creates an unencrypted Backup after warning acceptance and downloads it', async ({
    page
  }) => {
    let current: BackupOperationSummary | null = null;
    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation: current })
    );
    await page.route(startRoute(), async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        encryption: { enabled: false },
        confirmation: { unencryptedAccepted: true }
      });
      current = backupOperation({
        state: 'succeeded',
        stage: 'succeeded',
        cancellable: false,
        progress: { current: 3, total: 3 },
        finishedAt: '2026-07-25T00:01:00.000Z',
        result: {
          filename: 'unencrypted.nvt',
          sizeBytes: 4,
          encrypted: false,
          artifactId: 'artifact-unencrypted',
          expiresAt: '2099-07-26T00:00:00.000Z'
        }
      });
      await fulfillJson(route, current, 202);
    });
    await page.route('**/api/backups/operations/*/download-token', (route) =>
      fulfillJson(route, { token: 'download-token-unencrypted', expiresAt: '2099-01-01T00:00:00Z' })
    );
    await page.route('**/api/backups/downloads/*', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/vnd.novel-tool.backup',
          'content-disposition': 'attachment; filename="unencrypted.nvt"'
        },
        body: 'NVT!'
      })
    );
    await installE2eRuntime(page);
    const dialog = await openBackupPanel(page);
    await dialog.getByRole('checkbox', { name: 'Encrypt this backup' }).uncheck();
    await dialog
      .getByRole('checkbox', { name: /unencrypted backup can be read by anyone/i })
      .check();
    await dialog.getByRole('button', { name: 'Create backup' }).click();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download backup' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('unencrypted.nvt');
  });

  test('2. creates an encrypted Backup with password validation and downloads it', async ({
    page
  }) => {
    let current: BackupOperationSummary | null = null;
    let submittedPassword = '';
    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation: current })
    );
    await page.route(startRoute(), async (route) => {
      const body = route.request().postDataJSON() as {
        encryption: { enabled: boolean; password?: string };
      };
      submittedPassword = body.encryption.password ?? '';
      current = backupOperation({
        state: 'succeeded',
        stage: 'succeeded',
        cancellable: false,
        progress: { current: 4, total: 4 },
        finishedAt: '2026-07-25T00:01:00.000Z',
        result: {
          filename: 'encrypted.nvt',
          sizeBytes: 4,
          encrypted: true,
          artifactId: 'artifact-encrypted',
          expiresAt: '2099-07-26T00:00:00.000Z'
        }
      });
      await fulfillJson(route, current, 202);
    });
    await page.route('**/api/backups/operations/*/download-token', (route) =>
      fulfillJson(route, { token: 'download-token-encrypted', expiresAt: '2099-01-01T00:00:00Z' })
    );
    await page.route('**/api/backups/downloads/*', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/vnd.novel-tool.backup',
          'content-disposition': 'attachment; filename="encrypted.nvt"'
        },
        body: 'NVT!'
      })
    );
    await installE2eRuntime(page);
    const dialog = await openBackupPanel(page);
    await dialog.getByLabel('Backup password').fill('exact password');
    await dialog.getByLabel('Confirm password').fill('exact password');
    await dialog.getByRole('button', { name: 'Create backup' }).click();
    expect(submittedPassword).toBe('exact password');
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download backup' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('encrypted.nvt');
  });

  test('3. uploads multiple chunks, loses one response, and continues from server offset', async ({
    page
  }) => {
    const content = Buffer.alloc(17 * 1024 * 1024, 7);
    let lost = false;
    const state = await installRestoreHarness(page, {
      onRequest: async (route, path, method, harness) => {
        if (!path.endsWith('/chunk') || method !== 'PUT') return false;
        const request = route.request();
        const offset = Number(request.headers()['upload-offset']);
        harness.chunkOffsets.push(offset);
        const length = request.postDataBuffer()?.byteLength ?? 0;
        harness.session = restoreSession({
          ...harness.session,
          state: offset + length >= content.length ? 'uploaded' : 'uploading',
          stage: 'uploading',
          originalFilename: 'multi.nvt',
          expectedBytes: content.length,
          receivedBytes: offset + length,
          encrypted: null,
          inventory: null,
          compatibility: null
        });
        if (offset === 8 * 1024 * 1024 && !lost) {
          lost = true;
          await route.abort('failed');
          return true;
        }
        await fulfillJson(route, {
          receivedBytes: harness.session.receivedBytes,
          expectedBytes: content.length,
          state: harness.session.state
        });
        return true;
      }
    });
    const dialog = await openBackupPanel(page);
    await restoreWizard(dialog).getByLabel('Backup file', { exact: true }).setInputFiles({
      name: 'multi.nvt',
      mimeType: 'application/vnd.novel-tool.backup',
      buffer: content
    });
    await dialog.getByRole('button', { name: 'Upload and validate' }).click();
    await expect(dialog).toContainText('Review backup inventory');
    expect(state.chunkOffsets).toEqual([0, 8 * 1024 * 1024, 16 * 1024 * 1024]);
  });

  test('4. reloads during upload, reselects the matching file, and resumes', async ({ page }) => {
    const content = Buffer.from('matching restore file');
    const session = restoreSession({
      state: 'uploading',
      stage: 'uploading',
      expectedBytes: content.length,
      receivedBytes: 4,
      encrypted: null,
      inventory: null,
      compatibility: null
    });
    await seedRestoreStorage(page, {
      session,
      fingerprint: partialFingerprint(content),
      filename: 'matching.nvt',
      size: content.length,
      acknowledgedBytes: 4
    });
    await installRestoreHarness(page, { session });
    const dialog = await openBackupPanel(page);
    await expect(dialog).toContainText(/saved.*server|4 KB \/ 0 KB/i);
    await dialog.getByLabel('Choose the same file again to continue').setInputFiles({
      name: 'matching.nvt',
      mimeType: 'application/vnd.novel-tool.backup',
      buffer: content
    });
    await expect(dialog.getByRole('button', { name: 'Resume upload' })).toBeVisible();
  });

  test('5. rejects a different file fingerprint after reload', async ({ page }) => {
    const original = Buffer.from('original restore file');
    const different = Buffer.from('different restore file');
    const session = restoreSession({
      state: 'uploading',
      stage: 'uploading',
      expectedBytes: original.length,
      receivedBytes: 4,
      encrypted: null,
      inventory: null,
      compatibility: null
    });
    await seedRestoreStorage(page, {
      session,
      fingerprint: partialFingerprint(original),
      filename: 'original.nvt',
      size: original.length,
      acknowledgedBytes: 4
    });
    await installRestoreHarness(page, { session });
    const dialog = await openBackupPanel(page);
    await dialog.getByLabel('Choose the same file again to continue').setInputFiles({
      name: 'different.nvt',
      mimeType: 'application/vnd.novel-tool.backup',
      buffer: different
    });
    await expect(dialog).toContainText('does not match the saved size and fingerprint');
  });

  test('6. rejects a wrong encrypted password and accepts the next correct password', async ({
    page
  }) => {
    let attempts = 0;
    const session = restoreSession({
      state: 'awaiting-password',
      stage: 'awaiting-password',
      encrypted: true,
      passwordFailures: 0,
      attemptsRemaining: 4,
      inventory: null,
      compatibility: null
    });
    await seedRestoreStorage(page, { session });
    await installRestoreHarness(page, {
      session,
      onRequest: async (route, path, method, state) => {
        if (!path.endsWith('/unlock') || method !== 'POST') return false;
        attempts += 1;
        if (attempts === 1) {
          state.session = restoreSession({
            ...session,
            passwordFailures: 1,
            attemptsRemaining: 3
          });
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              data: null,
              error: {
                code: 'BACKUP_PASSWORD_INVALID',
                message: 'Backup password is invalid',
                details: { attemptsRemaining: 3 }
              }
            })
          });
          return true;
        }
        state.session = restoreSession({ encrypted: true });
        await fulfillJson(route, state.session);
        return true;
      }
    });
    const dialog = await openBackupPanel(page);
    const wizard = restoreWizard(dialog);
    const password = wizard.getByLabel(/^(?:Backup password|Mật khẩu bản sao lưu)/);
    await password.fill('wrong password');
    await wizard.getByRole('button', { name: 'Unlock backup' }).click();
    await expect(dialog).toContainText('3 attempts remaining');
    await expect(password).toHaveValue('');
    await password.fill('correct password');
    await wizard.getByRole('button', { name: 'Unlock backup' }).click();
    await expect(dialog).toContainText('Review backup inventory');
  });

  test('7. deletes the session after the fifth wrong password and requires reselect', async ({
    page
  }) => {
    const session = restoreSession({
      state: 'awaiting-password',
      stage: 'awaiting-password',
      encrypted: true,
      passwordFailures: 4,
      attemptsRemaining: 1,
      inventory: null,
      compatibility: null
    });
    await seedRestoreStorage(page, { session });
    await installRestoreHarness(page, {
      session,
      onRequest: async (route, path, method, state) => {
        if (!path.endsWith('/unlock') || method !== 'POST') return false;
        state.session = null;
        await route.fulfill({
          status: 410,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            error: {
              code: 'BACKUP_PASSWORD_INVALID',
              message: 'Password attempts are exhausted',
              details: { attemptsRemaining: 0 }
            }
          })
        });
        return true;
      }
    });
    const dialog = await openBackupPanel(page);
    const wizard = restoreWizard(dialog);
    await wizard
      .getByLabel(/^(?:Backup password|Mật khẩu bản sao lưu)/)
      .fill('fifth wrong password');
    await wizard.getByRole('button', { name: 'Unlock backup' }).click();
    await expect(dialog).toContainText('Choose a backup file');
    await expect(wizard.getByLabel('Backup file', { exact: true })).toBeVisible();
  });

  test('8. displays inventory counts without titles or content', async ({ page }) => {
    const session = restoreSession();
    await seedRestoreStorage(page, { session, step: 'inventory' });
    await installRestoreHarness(page, { session });
    const dialog = await openBackupPanel(page);
    await expect(dialog).toContainText('Review backup inventory');
    await expect(dialog).toContainText('21');
    await expect(dialog).not.toContainText('Secret Novel Title');
    await expect(dialog).not.toContainText('Chapter content');
    await expect(dialog.locator('dl')).toBeVisible();
  });

  test('9. replans after target data makes a Merge plan stale', async ({ page }) => {
    const plan = restorePlan('merge');
    const session = restoreSession({
      mergePlan: plan,
      mergePlanFingerprint: planFingerprint,
      selectedMode: 'merge',
      settingsPolicy: 'keep-current',
      inspectionToken
    });
    const operation = restoreOperation({
      state: 'failed',
      stage: 'verifying-plan',
      cancellable: false,
      finishedAt: '2026-07-25T00:01:00.000Z',
      error: { code: 'RESTORE_PLAN_STALE', retryable: true, details: {} }
    });
    await seedRestoreStorage(page, {
      session,
      step: 'result',
      operationId: operation.id,
      inspectionTokenValue: inspectionToken
    });
    const state = await installRestoreHarness(page, { session, operation });
    const dialog = await openBackupPanel(page);
    await dialog.getByRole('button', { name: 'Calculate a new impact plan' }).click();
    await expect(dialog).toContainText('Review impact');
    expect(state.session?.mergePlanFingerprint).toBe(planFingerprint);
  });

  test('10. completes Merge without reload and applies allowlisted settings', async ({ page }) => {
    const plan = restorePlan('merge', 'use-backup');
    const session = restoreSession({
      mergePlan: plan,
      mergePlanFingerprint: planFingerprint,
      selectedMode: 'merge',
      settingsPolicy: 'use-backup',
      inspectionToken
    });
    const operation = restoreOperation({
      state: 'succeeded',
      stage: 'succeeded',
      cancellable: false,
      finishedAt: '2026-07-25T00:01:00.000Z',
      result: {
        restoreMode: 'merge',
        settingsPolicy: 'use-backup',
        impact: plan.impact,
        settingsPending: true
      }
    });
    await seedRestoreStorage(page, {
      session,
      step: 'result',
      operationId: operation.id,
      inspectionTokenValue: inspectionToken,
      pendingSettings: {
        'novel-tool-theme': 'dark',
        'novel-tool-language': 'vi',
        unrelated: 'must-not-apply'
      },
      settingsPolicy: 'use-backup'
    });
    await installRestoreHarness(page, { session, operation });
    await prepareSettingsPage(page);
    const documentNavigations = trackSettingsDocumentNavigations(page);
    const dialog = await openBackupPanelFromLoadedPage(page);
    await expect(dialog).toContainText(/Restore result|Kết quả khôi phục/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('novel-tool-theme')))
      .toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBeNull();
    expect(documentNavigations).toHaveLength(0);
  });

  test('11. requires the exact Replace confirmation phrase', async ({ page }) => {
    const plan = restorePlan('replace');
    const session = restoreSession({
      mergePlan: plan,
      mergePlanFingerprint: planFingerprint,
      selectedMode: 'replace',
      settingsPolicy: 'keep-current',
      inspectionToken
    });
    await seedRestoreStorage(page, {
      session,
      step: 'confirmation',
      inspectionTokenValue: inspectionToken,
      mode: 'replace'
    });
    await installRestoreHarness(page, { session });
    const dialog = await openBackupPanel(page);
    const action = dialog.getByRole('button', { name: 'Replace data' });
    const phrase = dialog.getByLabel('Type exactly: THAY THẾ DỮ LIỆU');
    await expect(action).toBeDisabled();
    await phrase.fill('THAY THẾ DỮ LIỆU ');
    await expect(action).toBeDisabled();
    await phrase.fill('THAY THẾ DỮ LIỆU');
    await expect(action).toBeEnabled();
  });

  test('12. blocks maintenance on safety backup failure and allows retry', async ({ page }) => {
    const plan = restorePlan('replace');
    const session = restoreSession({
      mergePlan: plan,
      mergePlanFingerprint: planFingerprint,
      selectedMode: 'replace',
      settingsPolicy: 'keep-current',
      inspectionToken
    });
    const operation = restoreOperation({
      mode: 'replace',
      state: 'failed',
      stage: 'safety-backup',
      cancellable: false,
      finishedAt: '2026-07-25T00:01:00.000Z',
      error: { code: 'INTERNAL_ERROR', retryable: false, details: {} }
    });
    await seedRestoreStorage(page, {
      session,
      step: 'result',
      operationId: operation.id,
      inspectionTokenValue: inspectionToken,
      mode: 'replace'
    });
    await installRestoreHarness(page, { session, operation });
    const dialog = await openBackupPanel(page);
    await expect(dialog).toContainText('INTERNAL_ERROR');
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog).toContainText('Review impact');
    await expect(dialog).not.toContainText('Entering maintenance');
  });

  test('13. completes Replace, reloads once, and reopens Result with a safety artifact', async ({
    page
  }) => {
    const plan = restorePlan('replace', 'use-backup');
    const session = restoreSession({
      mergePlan: plan,
      mergePlanFingerprint: planFingerprint,
      selectedMode: 'replace',
      settingsPolicy: 'use-backup',
      inspectionToken,
      lockedOperationId: 'restore-operation-1'
    });
    const operation = restoreOperation({
      mode: 'replace',
      state: 'succeeded',
      stage: 'succeeded',
      cancellable: false,
      progress: { current: 8, total: 8 },
      finishedAt: '2026-07-25T00:01:00.000Z',
      result: {
        restoreMode: 'replace',
        settingsPolicy: 'use-backup',
        impact: plan.impact,
        settingsPending: true,
        safetyArtifactId: 'safety-artifact-1',
        expiresAt: '2099-07-26T00:00:00.000Z'
      }
    });
    await seedRestoreStorage(page, {
      session,
      step: 'result',
      operationId: operation.id,
      inspectionTokenValue: inspectionToken,
      pendingSettings: { 'novel-tool-theme': 'dark' },
      mode: 'replace',
      settingsPolicy: 'use-backup'
    });
    await installRestoreHarness(page, { session, operation });
    await prepareSettingsPage(page);
    const documentNavigations = trackSettingsDocumentNavigations(page);
    await dataBackupButton(page).click();
    await expect.poll(() => documentNavigations.length, { timeout: 8_000 }).toBe(1);
    await expect(dataBackupButton(page)).toBeVisible();
    await dataBackupButton(page).click();
    const dialog = backupDialog(page);
    await expect(dialog).toContainText(/Restore result|Kết quả khôi phục/);
    await expect(dialog).toContainText(/Safety backup|Bản sao an toàn/);
    await page.waitForTimeout(1_200);
    expect(documentNavigations).toHaveLength(1);
  });

  test('14. closes and reopens Settings during Restore and reconnects', async ({ page }) => {
    const operation = restoreOperation({ stage: 'preparing', progress: { current: 2, total: 5 } });
    await installRestoreHarness(page, { operation });
    let dialog = await openBackupPanel(page);
    await expect(dialog).toContainText('Preparing atomic merge');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: /^Data and backups/ }).click();
    dialog = backupDialog(page);
    await expect(dialog).toContainText('Preparing atomic merge');
  });

  test('15. uses one-second polling while disconnected and stops active polling after reconnect state', async ({
    page
  }) => {
    let currentRequests = 0;
    let operation: BackupOperationSummary | null = restoreOperation();
    await page.route('**/api/backups/operations/current', async (route) => {
      currentRequests += 1;
      await fulfillJson(route, { operation });
    });
    await page.route('**/api/backups/restore-sessions/current', (route) =>
      fulfillJson(route, { session: null })
    );
    await page.route('**/api/scheduler/status', (route) =>
      fulfillJson(route, {
        running: false,
        tickIntervalMs: 60_000,
        monitoredNovels: 0,
        dueNovels: 0,
        activeRuns: 0
      })
    );
    await installE2eRuntime(page);
    const dialog = await openBackupPanel(page);
    const initial = currentRequests;
    await expect.poll(() => currentRequests, { timeout: 4_000 }).toBeGreaterThan(initial);
    operation = restoreOperation({
      state: 'succeeded',
      stage: 'succeeded',
      cancellable: false,
      finishedAt: '2026-07-25T00:01:00.000Z',
      result: { restoreMode: 'merge', settingsPolicy: 'keep-current' }
    });
    await page.evaluate(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'data.changed', resources: ['backup'] }
        })
      )
    );
    await expect(dialog).toBeVisible();
    const afterTerminal = currentRequests;
    await page.waitForTimeout(1_500);
    expect(currentRequests - afterTerminal).toBeLessThanOrEqual(1);
  });

  test('16. shows interrupted after API restart and never auto-resumes', async ({ page }) => {
    const session = restoreSession({ lockedOperationId: 'restore-operation-1' });
    const operation = restoreOperation({
      state: 'interrupted',
      stage: 'interrupted',
      cancellable: false,
      finishedAt: '2026-07-25T00:01:00.000Z',
      error: { code: 'BACKUP_OPERATION_INTERRUPTED', retryable: false, details: {} }
    });
    await seedRestoreStorage(page, {
      session,
      step: 'result',
      operationId: operation.id
    });
    const state = await installRestoreHarness(page, { session, operation });
    const dialog = await openBackupPanel(page);
    await expect(dialog).toContainText(/interrupted/i);
    expect(state.restoreStarts).toBe(0);
  });

  test('17. switches an operation conflict to current Restore monitoring', async ({ page }) => {
    const plan = restorePlan('merge');
    const session = restoreSession({
      mergePlan: plan,
      mergePlanFingerprint: planFingerprint,
      selectedMode: 'merge',
      settingsPolicy: 'keep-current',
      inspectionToken
    });
    const active = restoreOperation({ stage: 'preparing', progress: { current: 2, total: 5 } });
    await seedRestoreStorage(page, {
      session,
      step: 'confirmation',
      inspectionTokenValue: inspectionToken
    });
    await installRestoreHarness(page, {
      session,
      onRequest: async (route, path, method) => {
        if (!path.endsWith('/restore') || method !== 'POST') return false;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            error: {
              code: 'BACKUP_OPERATION_ACTIVE',
              message: 'Another operation is active',
              details: { retryable: true, operation: active }
            }
          })
        });
        return true;
      }
    });
    const dialog = await openBackupPanel(page);
    await dialog.getByRole('button', { name: 'Restore and merge' }).click();
    await expect(dialog).toContainText('Preparing atomic merge');
  });

  test('18. offers cancellation before and removes it after the irreversible boundary', async ({
    page
  }) => {
    let operation = restoreOperation({
      mode: 'replace',
      stage: 'validating-staging',
      progress: { current: 3, total: 8 },
      cancellable: true
    });
    await page.route('**/api/backups/operations/current', (route) =>
      fulfillJson(route, { operation })
    );
    await page.route('**/api/backups/operations/*/cancel', async (route) => {
      operation = restoreOperation({
        mode: 'replace',
        stage: 'entering-maintenance',
        progress: { current: 4, total: 8 },
        cancellable: false
      });
      await fulfillJson(route, operation);
    });
    await page.route('**/api/backups/restore-sessions/current', (route) =>
      fulfillJson(route, { session: null })
    );
    await installE2eRuntime(page);
    const dialog = await openBackupPanel(page);
    await dialog.getByRole('button', { name: 'Cancel operation' }).click();
    await expect(dialog.getByRole('button', { name: 'Cancel operation' })).toHaveCount(0);
    await expect(dialog).toContainText('cannot be cancelled at this stage');
  });
});
