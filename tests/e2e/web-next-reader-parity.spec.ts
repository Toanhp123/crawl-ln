import { expect, test, type Page } from '@playwright/test';

async function installReaderMocks(page: Page, chapterCount = 20) {
  const chapters = Array.from({ length: chapterCount }, (_, index) => ({
    id: `chapter-${index}`,
    novelId: 'novel-1',
    index,
    title: `Chapter ${index}`,
    sourceUrl: `https://example.test/chapter-${index}`,
    status: 'fetched',
    contentVersion: 1
  }));
  await page.route('**/api/novels/novel-1', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          novel: {
            id: 'novel-1',
            title: 'Reader parity novel',
            sourceUrl: 'https://example.test/novel',
            sourceName: 'Example',
            status: 'completed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z'
          },
          chapters
        },
        error: null
      })
    })
  );
  await page.route('**/api/chapters/*', async (route) => {
    const id = route.request().url().split('/').at(-1) ?? 'chapter-0';
    const index = Number(id.split('-').at(-1) ?? 0);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ...chapters[index],
          rawText: `Raw chapter ${index}`,
          cleanText: `Paragraph one for chapter ${index}.\n\nParagraph two for chapter ${index}.`
        },
        error: null
      })
    });
  });
  await page.route('**/api/novels/novel-1/task', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null })
    })
  );
  await page.route('**/api/events', (route) => route.abort());
}

test('reader keeps a bounded five-chapter render window', async ({ page }) => {
  await installReaderMocks(page);
  await page.goto('/library/novel-1/read/10');
  await expect.poll(() => page.locator('[data-reader-chapter]').count()).toBeGreaterThan(0);
  expect(await page.locator('[data-reader-chapter]').count()).toBeLessThanOrEqual(5);
  await page.locator('#reader-scroll-root').evaluate((element) => {
    element.scrollTo(0, element.scrollHeight);
  });
  await expect.poll(() => page.locator('[data-reader-chapter]').count()).toBeGreaterThan(0);
  expect(await page.locator('[data-reader-chapter]').count()).toBeLessThanOrEqual(5);
});

test('novel detail exposes reading management and chapter navigation landmarks', async ({
  page
}) => {
  await installReaderMocks(page, 4);
  await page.goto('/library/novel-1');
  await expect(page.getByRole('heading', { name: 'Reader parity novel' })).toBeVisible();
  await expect(page.getByRole('button', { name: /start reading|continue/i })).toBeVisible();
  await expect(page.getByText(/chapter 0/i)).toBeVisible();
});
