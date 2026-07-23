import { expect, test, type Page, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const plugin = {
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
};

const success = (data: unknown) => JSON.stringify({ data, error: null });

async function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: success(data)
  });
}

async function installButtonFeedbackApi(
  page: Page,
  options: { failDisable?: boolean } = {}
): Promise<void> {
  await page.route('**/api/source-reader/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/source-reader/plugins' && request.method() === 'GET') {
      await fulfillJson(route, [plugin]);
      return;
    }

    if (
      pathname === '/api/source-reader/plugins/novelcool/disable' &&
      request.method() === 'POST'
    ) {
      if (options.failDisable) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            error: { code: 'INTERNAL_ERROR', message: 'Toggle failed', details: null }
          })
        });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await fulfillJson(route, []);
  });
}

test('source switch shows stable in-place loading feedback even for a fast request', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await installButtonFeedbackApi(page);
  await installE2eRuntime(page);
  await page.goto('/sources');

  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });
  await expect(toggle).toBeChecked();
  const before = await toggle.boundingBox();

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-feedback-phase', 'loading');
  const during = await toggle.boundingBox();

  expect(before).not.toBeNull();
  expect(during).not.toBeNull();
  expect(Math.abs(during!.width - before!.width)).toBeLessThan(1);
  expect(Math.abs(during!.height - before!.height)).toBeLessThan(1);

  await expect(toggle).toHaveAttribute('data-feedback-phase', 'success', { timeout: 1200 });
});

test('source switch reports an error phase instead of a success check on failure', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await installButtonFeedbackApi(page, { failDisable: true });
  await installE2eRuntime(page);
  await page.goto('/sources');

  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();

  await expect(toggle).toHaveAttribute('data-feedback-phase', 'loading');
  await expect(toggle).toHaveAttribute('data-feedback-phase', 'error', { timeout: 1400 });
  await expect(toggle).not.toHaveAttribute('data-feedback-phase', 'success');
});
