import { expect, test, type Page, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const successEnvelope = (data: unknown) => JSON.stringify({ data, error: null });
const failureEnvelope = (code: string, message: string) =>
  JSON.stringify({
    data: null,
    error: { code, message, details: null }
  });

async function fulfillSuccess(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: successEnvelope(data)
  });
}

async function fulfillFailure(
  route: Route,
  message: string,
  status = 503,
  code = 'SERVICE_UNAVAILABLE'
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: failureEnvelope(code, message)
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const neverRebuiltStatus = {
  rebuildRunning: false,
  indexedDocuments: 1_280,
  lastRebuiltAt: null,
  lastIndexedDocuments: null
};

const rebuiltStatus = {
  rebuildRunning: false,
  indexedDocuments: 1_280,
  lastRebuiltAt: '2026-07-25T02:30:00.000Z',
  lastIndexedDocuments: 1_250
};

const schedulerStatus = {
  running: true,
  tickIntervalMs: 60_000,
  monitoredNovels: 12,
  dueNovels: 0,
  activeRuns: 0,
  lastTickAt: '2026-07-25T02:30:00.000Z',
  nextTickAt: '2026-07-25T02:31:00.000Z'
};

async function openSearchIndex(page: Page) {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.setItem('novel-tool-language', 'en');
    localStorage.setItem('novel-tool-theme', 'light');
    localStorage.setItem('novel-tool-density', 'compact');
    localStorage.setItem('novel-tool-app-font', 'medium');
  });
  await page.route('**/api/scheduler/status', (route) => fulfillSuccess(route, schedulerStatus));
  await page.goto('/settings');
  await page.getByRole('button', { name: /^Search index/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Search index' });
  await expect(dialog).toBeVisible();
  return dialog;
}

function rebuildAction(page: Page) {
  return page.locator('[data-search-index-controls] button').last();
}

test('Search Index sheet keeps four rows in the never-rebuilt state', async ({ page }) => {
  await page.route('**/api/search/status', (route) => fulfillSuccess(route, neverRebuiltStatus));
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  await expect(dialog.locator('dt')).toHaveCount(4);
  await expect(dialog).toContainText('Ready');
  await expect(dialog).toContainText('Current documents');
  await expect(dialog).toContainText('1,280');
  await expect(dialog).toContainText('Never rebuilt');
  await expect(dialog).toContainText('No data');
  await expect(rebuildAction(page)).toHaveAccessibleName('Rebuild search index');
  await expect(page).toHaveURL(/\/settings$/);
});

test('Search Index rebuild keeps the sheet open and shows transient count feedback', async ({
  page
}) => {
  let status = { ...neverRebuiltStatus };

  await page.route('**/api/search/status', (route) => fulfillSuccess(route, status));
  await page.route('**/api/search/rebuild', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const rebuiltAt = new Date().toISOString();
    status = {
      rebuildRunning: false,
      indexedDocuments: 1_280,
      lastRebuiltAt: rebuiltAt,
      lastIndexedDocuments: 1_280
    };
    await fulfillSuccess(route, { indexedDocuments: 1_280, rebuiltAt });
  });
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  const action = rebuildAction(page);
  await action.click();

  await expect(dialog).toBeVisible();
  await expect(action).toHaveAccessibleName('Rebuilding');
  await expect(action).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('status')).toContainText(
    'Rebuilt the search index with 1,280 documents.'
  );
  await expect(dialog.locator('[data-search-index-status-list] dd').last()).toHaveText('1,280');
  await expect(dialog.getByRole('status')).toHaveCount(0, { timeout: 3_000 });
  await expect(dialog).toBeVisible();
});

test('Search Index accepts a successful zero-document rebuild', async ({ page }) => {
  let status = { ...neverRebuiltStatus, indexedDocuments: 0 };

  await page.route('**/api/search/status', (route) => fulfillSuccess(route, status));
  await page.route('**/api/search/rebuild', async (route) => {
    const rebuiltAt = new Date().toISOString();
    status = {
      rebuildRunning: false,
      indexedDocuments: 0,
      lastRebuiltAt: rebuiltAt,
      lastIndexedDocuments: 0
    };
    await fulfillSuccess(route, { indexedDocuments: 0, rebuiltAt });
  });
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  await rebuildAction(page).click();

  await expect(dialog.getByRole('status')).toContainText(
    'Rebuilt the search index. It currently contains no documents.'
  );
  await expect(dialog.locator('[data-search-index-status-list] dd').nth(1)).toHaveText('Empty');
  await expect(dialog.locator('[data-search-index-status-list] dd').last()).toHaveText('Empty');
});

test('Search Index rebuild errors remain inline until the next attempt', async ({ page }) => {
  let attempts = 0;

  await page.route('**/api/search/status', (route) => fulfillSuccess(route, rebuiltStatus));
  await page.route('**/api/search/rebuild', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await fulfillFailure(route, 'Search service unavailable');
      return;
    }
    await fulfillSuccess(route, {
      indexedDocuments: 1_280,
      rebuiltAt: rebuiltStatus.lastRebuiltAt
    });
  });
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  const action = rebuildAction(page);
  await action.click();

  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Could not rebuild the search index');
  await expect(alert).toContainText('Search service unavailable');
  await page.waitForTimeout(1_200);
  await expect(alert).toBeVisible();
  await expect(dialog.locator('dt')).toHaveCount(4);

  await action.click();
  await expect(alert).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('Rebuilt the search index');
});

test('Search Index initial status errors expose Retry and block rebuild', async ({ page }) => {
  let allowSuccess = false;

  await page.route('**/api/search/status', (route) =>
    allowSuccess
      ? fulfillSuccess(route, neverRebuiltStatus)
      : fulfillFailure(route, 'Search status unavailable')
  );
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  await expect(dialog.getByRole('alert')).toContainText('Unable to load Search Index status');
  await expect(dialog.getByRole('alert')).toContainText('Search status unavailable');
  await expect(dialog.getByRole('button', { name: 'Rebuild search index' })).toBeDisabled();

  allowSuccess = true;
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.locator('dt')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Rebuild search index' })).toBeEnabled();
});

test('Search Index keeps cached rows when a background status refresh fails', async ({ page }) => {
  let statusRequests = 0;
  let failRefresh = false;
  const eventGate = deferred();
  let eventSent = false;

  await page.route('**/api/search/status', async (route) => {
    statusRequests += 1;
    if (!failRefresh) {
      await fulfillSuccess(route, rebuiltStatus);
      return;
    }
    await fulfillFailure(route, 'Search status refresh unavailable');
  });
  await page.route('**/api/events', async (route) => {
    if (eventSent) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await eventGate.promise;
    eventSent = true;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      },
      body: `data: ${JSON.stringify({
        id: 'search-refresh-error-1',
        type: 'data.changed',
        resources: ['search'],
        reason: 'search.rebuild.completed',
        occurredAt: new Date().toISOString()
      })}\n\n`
    });
  });
  await installE2eRuntime(page, { mockEvents: false });

  const dialog = await openSearchIndex(page);
  await expect(dialog.locator('dt')).toHaveCount(4);

  const initialStatusRequests = statusRequests;
  failRefresh = true;
  eventGate.resolve();
  await expect.poll(() => statusRequests).toBeGreaterThan(initialStatusRequests);
  await expect(dialog.locator('dt')).toHaveCount(4);
  await expect(dialog).toContainText('1,280');
  await expect(dialog.getByRole('status')).toContainText('Could not refresh Search Index status');
  await expect(rebuildAction(page)).toBeEnabled();
});

test('Search Index treats rebuild conflict as synchronization instead of danger feedback', async ({
  page
}) => {
  let statusRequestsAfterConflict = 0;
  let conflictStarted = false;
  let status = { ...neverRebuiltStatus };

  await page.route('**/api/search/status', async (route) => {
    if (conflictStarted) statusRequestsAfterConflict += 1;
    await fulfillSuccess(route, status);
  });
  await page.route('**/api/search/rebuild', async (route) => {
    status = { ...status, rebuildRunning: true };
    conflictStarted = true;
    await fulfillFailure(route, 'Search index rebuild is already running', 409, 'CONFLICT');
  });
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  await rebuildAction(page).click();

  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => statusRequestsAfterConflict, { timeout: 5_000 }).toBeGreaterThan(0);
  await expect(rebuildAction(page)).toHaveAccessibleName('Rebuilding');
  await expect(rebuildAction(page)).toBeDisabled();

  const runningStatusRequests = statusRequestsAfterConflict;
  status = {
    rebuildRunning: false,
    indexedDocuments: 1_300,
    lastRebuiltAt: new Date().toISOString(),
    lastIndexedDocuments: 1_300
  };

  await expect
    .poll(() => statusRequestsAfterConflict, { timeout: 4_000 })
    .toBeGreaterThan(runningStatusRequests);
  await expect(rebuildAction(page)).toHaveAccessibleName('Rebuild search index');
  await expect(rebuildAction(page)).toBeEnabled();
  await expect(dialog).toContainText('1,300');
});

test('Search Index realtime events invalidate status without reloading the page', async ({
  page
}) => {
  let statusRequests = 0;
  let status = { ...neverRebuiltStatus, rebuildRunning: true };
  const eventGate = deferred();
  let eventSent = false;

  await page.route('**/api/search/status', async (route) => {
    statusRequests += 1;
    await fulfillSuccess(route, status);
  });
  await page.route('**/api/events', async (route) => {
    if (eventSent) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await eventGate.promise;
    eventSent = true;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      },
      body: `data: ${JSON.stringify({
        id: 'search-e2e-1',
        type: 'data.changed',
        resources: ['search'],
        reason: 'search.rebuild.completed',
        occurredAt: new Date().toISOString()
      })}\n\n`
    });
  });
  await installE2eRuntime(page, { mockEvents: false });

  const dialog = await openSearchIndex(page);
  await expect(dialog.getByRole('button', { name: 'Rebuilding' })).toBeDisabled();

  status = {
    rebuildRunning: false,
    indexedDocuments: 1_300,
    lastRebuiltAt: new Date().toISOString(),
    lastIndexedDocuments: 1_300
  };
  eventGate.resolve();

  await expect.poll(() => statusRequests).toBeGreaterThan(1);
  await expect(dialog.getByRole('button', { name: 'Rebuild search index' })).toBeEnabled();
  await expect(dialog).toContainText('1,300');
  await expect(page).toHaveURL(/\/settings$/);
});

test('Search Index uses one-second fallback polling while realtime is disconnected', async ({
  page
}) => {
  let statusRequests = 0;
  let completed = false;

  await page.route('**/api/search/status', async (route) => {
    statusRequests += 1;
    await fulfillSuccess(route, {
      rebuildRunning: !completed,
      indexedDocuments: completed ? 20 : 10,
      lastRebuiltAt: completed ? new Date().toISOString() : null,
      lastIndexedDocuments: completed ? 20 : null
    });
  });
  await installE2eRuntime(page);

  const dialog = await openSearchIndex(page);
  await expect(rebuildAction(page)).toHaveAccessibleName('Rebuilding');
  await expect(rebuildAction(page)).toBeDisabled();

  const runningStatusRequests = statusRequests;
  completed = true;
  await expect
    .poll(() => statusRequests, { timeout: 4_000 })
    .toBeGreaterThan(runningStatusRequests);
  await expect(rebuildAction(page)).toHaveAccessibleName('Rebuild search index');
  await expect(rebuildAction(page)).toBeEnabled();
  await expect(dialog).toContainText('20');
});
