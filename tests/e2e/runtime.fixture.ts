import type { Page } from '@playwright/test';

export async function installE2eRuntime(page: Page): Promise<void> {
  await page.route('**/api/runtime', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { formatVersion: 1, instanceId: 'e2e' },
        error: null
      })
    })
  );
  await page.addInitScript(() => {
    localStorage.setItem('novel-tool-runtime-instance', 'e2e');
  });
}
