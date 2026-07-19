import { expect, test } from '@playwright/test';

const plugin = {
  manifest: {
    id: 'novelcool',
    name: 'NovelCool',
    version: '1.0.0',
    apiVersion: 1,
    priority: 10,
    match: ['novelcool.com'],
    capabilities: ['metadata', 'chapters', 'cover']
  },
  status: 'active',
  enabled: true,
  health: {
    successCount: 12,
    failureCount: 0,
    averageLatencyMs: 120
  }
};

test('source refresh shows stable in-place loading feedback even for a fast request', async ({
  page
}) => {
  await page.route('http://127.0.0.1:3000/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/plugins' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [plugin], error: null })
      });
      return;
    }

    if (pathname === '/api/plugins/reload' && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [plugin], error: null })
      });
      return;
    }

    if (pathname === '/api/tasks/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { activeCount: 0, queuedCount: 0, failedCount: 0 },
          error: null
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], error: null })
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
  await page.route('http://127.0.0.1:3000/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/plugins' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [plugin], error: null })
      });
      return;
    }

    if (pathname === '/api/plugins/reload' && request.method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: { message: 'Reload failed' } })
      });
      return;
    }

    if (pathname === '/api/tasks/summary') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { activeCount: 0, queuedCount: 0, failedCount: 0 },
          error: null
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], error: null })
    });
  });

  await page.goto('/sources');
  const refresh = page.getByRole('button', { name: /refresh|tải lại/i });
  await refresh.click();

  await expect(refresh).toHaveAttribute('data-feedback-phase', 'loading');
  await expect(refresh).toHaveAttribute('data-feedback-phase', 'error', { timeout: 1400 });
  await expect(refresh).not.toHaveAttribute('data-feedback-phase', 'success');
});
