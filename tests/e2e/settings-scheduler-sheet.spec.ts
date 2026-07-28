import { expect, test, type Page, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const successEnvelope = (data: unknown) => JSON.stringify({ data, error: null });
const failureEnvelope = (message: string) =>
  JSON.stringify({
    data: null,
    error: { code: 'SERVICE_UNAVAILABLE', message, details: null }
  });

async function fulfillSuccess(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: successEnvelope(data)
  });
}

async function fulfillFailure(route: Route, message: string): Promise<void> {
  await route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: failureEnvelope(message)
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const baseStatus = {
  running: true,
  tickIntervalMs: 60_000,
  monitoredNovels: 12,
  dueNovels: 3,
  activeRuns: 0,
  lastTickAt: '2026-07-24T15:58:00.000Z',
  nextTickAt: '2026-07-24T16:08:00.000Z'
};

async function openScheduler(page: Page) {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    localStorage.setItem('novel-tool-language', 'en');
    localStorage.setItem('novel-tool-theme', 'light');
    localStorage.setItem('novel-tool-density', 'compact');
    localStorage.setItem('novel-tool-app-font', 'medium');
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: /^Scheduler/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Scheduler' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('Scheduler sheet shows six rows and keeps success feedback inside the open dialog', async ({
  page
}) => {
  let status = { ...baseStatus };

  await page.route('**/api/scheduler/status', (route) => fulfillSuccess(route, status));
  await page.route('**/api/scheduler/tick', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    status = { ...status, dueNovels: 0, lastTickAt: new Date().toISOString() };
    await fulfillSuccess(route, status);
  });
  await installE2eRuntime(page);

  const dialog = await openScheduler(page);
  await expect(dialog.locator('dt')).toHaveCount(6);
  await expect(dialog).toContainText('Monitored novels');
  await expect(dialog).toContainText('12');
  await expect(dialog).toContainText('Last run');
  await expect(dialog).toContainText('Next run');

  const action = dialog.locator('[data-scheduler-controls] button').last();
  await expect(action).toHaveAccessibleName('Run scheduler now');
  await action.click();
  await expect(dialog).toBeVisible();
  await expect(action).toHaveAccessibleName('Running');
  await expect(action).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('status')).toContainText('Scheduler check completed');
  await expect(dialog.getByRole('status')).toHaveCount(0, { timeout: 3_000 });
  await expect(dialog).toBeVisible();
});

test('Scheduler mutation errors remain inline until the next attempt', async ({ page }) => {
  let attempts = 0;

  await page.route('**/api/scheduler/status', (route) => fulfillSuccess(route, baseStatus));
  await page.route('**/api/scheduler/tick', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await fulfillFailure(route, 'Scheduler service unavailable');
      return;
    }
    await fulfillSuccess(route, baseStatus);
  });
  await installE2eRuntime(page);

  const dialog = await openScheduler(page);
  const action = dialog.locator('[data-scheduler-controls] button').last();
  await expect(action).toHaveAccessibleName('Run scheduler now');
  await action.click();

  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Scheduler check failed');
  await expect(alert).toContainText('Scheduler service unavailable');
  await page.waitForTimeout(1_200);
  await expect(alert).toBeVisible();
  await expect(dialog.locator('dt')).toHaveCount(6);

  await action.click();
  await expect(alert).toHaveCount(0);
  await expect(dialog.getByRole('status')).toContainText('Scheduler check completed');
});

test('Scheduler initial-load errors expose Retry and block Run now', async ({ page }) => {
  let allowSuccess = false;

  await page.route('**/api/scheduler/status', (route) =>
    allowSuccess
      ? fulfillSuccess(route, baseStatus)
      : fulfillFailure(route, 'Scheduler status unavailable')
  );
  await installE2eRuntime(page);

  const dialog = await openScheduler(page);
  await expect(dialog.getByRole('alert')).toContainText('Unable to load Scheduler status');
  await expect(dialog.getByRole('alert')).toContainText('Scheduler status unavailable');
  await expect(dialog.getByRole('button', { name: 'Run scheduler now' })).toBeDisabled();

  allowSuccess = true;
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog.locator('dt')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: 'Run scheduler now' })).toBeEnabled();
});

test('Scheduler realtime events invalidate status without reloading the page', async ({ page }) => {
  let statusRequests = 0;
  let status = { ...baseStatus, activeRuns: 1 };
  const eventGate = deferred();
  let eventSent = false;

  await page.route('**/api/scheduler/status', async (route) => {
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
    const event = {
      id: 'scheduler-e2e-1',
      type: 'data.changed',
      resources: ['scheduler'],
      reason: 'scheduler.tick.completed',
      occurredAt: new Date().toISOString()
    };
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      },
      body: `data: ${JSON.stringify(event)}\n\n`
    });
  });
  await installE2eRuntime(page, { mockEvents: false });

  const dialog = await openScheduler(page);
  const runningAction = dialog.getByRole('button', { name: 'Running' });
  await expect(runningAction).toBeDisabled();
  await expect(dialog).toContainText('Running');

  status = { ...status, activeRuns: 0, dueNovels: 0 };
  eventGate.resolve();

  await expect.poll(() => statusRequests).toBeGreaterThan(1);
  await expect(dialog.getByRole('button', { name: 'Run scheduler now' })).toBeEnabled();
  await expect(dialog.locator('[data-scheduler-status-list] dd').nth(2)).toHaveText('0');
  await expect(page).toHaveURL(/\/settings$/);
});
