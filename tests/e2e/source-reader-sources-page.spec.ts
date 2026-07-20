import { expect, test } from '@playwright/test';

const ok = (data: unknown) => ({ data, error: null });

test('Sources page loads Source Reader plugins and rolls back a failed switch', async ({
  page
}) => {
  await page.route('**/api/source-reader/plugins', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        contentType: 'application/json',
        json: ok([
          {
            id: 'novelcool',
            name: 'NovelCool',
            activeVersion: '1.0.0',
            trustLevel: 'built-in',
            status: 'active',
            enabled: true,
            capabilities: ['metadata', 'chapter-list', 'chapter-content'],
            domains: ['novelcool.com'],
            permissionsPending: false,
            health: { status: 'healthy' }
          }
        ])
      });
    }
    return route.continue();
  });
  for (const endpoint of ['credentials', 'network-profiles', 'auth/challenges']) {
    await page.route(`**/api/source-reader/${endpoint}`, (route) =>
      route.fulfill({ contentType: 'application/json', json: ok([]) })
    );
  }
  await page.route('**/api/source-reader/plugins/novelcool/disable', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      json: {
        data: null,
        error: { code: 'PLUGIN_UNAVAILABLE', message: 'failed', details: null }
      }
    })
  );

  await page.goto('/sources');
  const toggle = page.getByRole('switch', { name: /NovelCool/i });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
});
