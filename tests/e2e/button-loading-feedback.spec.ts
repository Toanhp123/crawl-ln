import { expect, test } from '@playwright/test';

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

test('source refresh shows stable in-place loading feedback even for a fast request', async ({
  page
}) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/source-reader/plugins' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: success([plugin])
      });
      return;
    }

    if (pathname === '/api/tasks/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: success({ activeCount: 0, queuedCount: 0, failedCount: 0 })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: success([])
    });
  });

  await page.goto('/sources');

  const refresh = page.getByRole('button', { name: /refresh|tải lại/i });
  await expect(refresh).toBeVisible();
  const before = await refresh.boundingBox();

  await refresh.click();
  await expect(refresh).toHaveAttribute('data-feedback-phase', 'loading');
  const during = await refresh.boundingBox();

  expect(before).not.toBeNull();
  expect(during).not.toBeNull();
  expect(Math.abs(during!.width - before!.width)).toBeLessThan(1);
  expect(Math.abs(during!.height - before!.height)).toBeLessThan(1);

  await expect(refresh).toHaveAttribute('data-feedback-phase', 'success', { timeout: 1200 });
});

test('source refresh reports an error phase instead of a success check on failure', async ({
  page
}) => {
  let pluginRequests = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/source-reader/plugins' && request.method() === 'GET') {
      pluginRequests += 1;
      if (pluginRequests === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: success([plugin])
        });
      } else {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            error: { code: 'INTERNAL_ERROR', message: 'Refresh failed', details: null }
          })
        });
      }
      return;
    }

    if (pathname === '/api/tasks/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: success({ activeCount: 0, queuedCount: 0, failedCount: 0 })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: success([])
    });
  });

  await page.goto('/sources');
  const refresh = page.getByRole('button', { name: /refresh|tải lại/i });
  await refresh.click();

  await expect(refresh).toHaveAttribute('data-feedback-phase', 'loading');
  await expect(refresh).toHaveAttribute('data-feedback-phase', 'error', { timeout: 1400 });
  await expect(refresh).not.toHaveAttribute('data-feedback-phase', 'success');
});
