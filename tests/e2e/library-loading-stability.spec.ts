import { expect, test } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const staleHistory = [
  {
    schemaVersion: 1,
    novelId: 'missing-novel',
    chapterId: 'missing-chapter',
    chapterIndex: 12,
    paragraphId: 'p-1',
    paragraphOffset: 0,
    scrollRatio: 0.4,
    updatedAt: '2026-07-19T00:00:00.000Z',
    lastOpenedAt: '2026-07-19T00:00:00.000Z'
  }
];

test('stale continue-reading history does not shift the library search controls', async ({
  page
}) => {
  await page.addInitScript((history) => {
    localStorage.setItem('novel-tool-language', 'en');
    localStorage.setItem('novel-tool-reader-history', JSON.stringify(history));
  }, staleHistory);

  await page.route('**/api/novels**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/novels') {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { items: [], total: 0, limit: 12, offset: 0 },
          error: null
        })
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        data: null,
        error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }
      })
    });
  });

  await installE2eRuntime(page, { mockNovels: false });

  const novelsResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/novels'
  );
  await page.goto('/library');

  const search = page.getByRole('searchbox').first();
  await expect(search).toBeVisible();
  const before = await search.boundingBox();

  await novelsResponse;
  await expect(page.getByText('Your library is empty', { exact: true })).toBeVisible();
  const after = await search.boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
});
