import type { Page, Route } from '@playwright/test';

export interface E2eRuntimeOptions {
  mockNovels?: boolean;
}

const envelope = (data: unknown) => JSON.stringify({ data, error: null });

async function fulfillJson(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: envelope(data)
  });
}

export async function installE2eRuntime(
  page: Page,
  { mockNovels = true }: E2eRuntimeOptions = {}
): Promise<void> {
  await page.route('**/api/runtime', (route) =>
    fulfillJson(route, { formatVersion: 1, instanceId: 'e2e' })
  );
  await page.route('**/api/events', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/tasks/summary', (route) =>
    fulfillJson(route, { activeCount: 0, queuedCount: 0, failedCount: 0 })
  );
  if (mockNovels) {
    await page.route(/\/api\/novels(?:\?.*)?$/, (route) =>
      fulfillJson(route, { items: [], total: 0, limit: 12, offset: 0 })
    );
  }
  await page.addInitScript(() => {
    localStorage.setItem('novel-tool-runtime-instance', 'e2e');
  });
}
