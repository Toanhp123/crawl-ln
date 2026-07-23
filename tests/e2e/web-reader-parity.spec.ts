import { expect, test, type Page } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

async function installReaderMocks(page: Page, chapterCount = 20) {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
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
  await page.route('**/api/novels/novel-1/chapters/*', async (route) => {
    const index = Number(new URL(route.request().url()).pathname.split('/').at(-1) ?? 0);
    const cleanText = Array.from(
      { length: 40 },
      (_, paragraph) =>
        `Paragraph ${paragraph + 1} for chapter ${index} keeps the reader scrollable.`
    ).join('\n\n');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ...chapters[index],
          rawText: `Raw chapter ${index}`,
          cleanText
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
  await installE2eRuntime(page);
}

test('reader keeps a bounded five-chapter render window', async ({ page }) => {
  await installReaderMocks(page);
  await page.goto('/library/novel-1/read/10');
  const renderedChapters = page.locator('#reader-content section[data-reader-chapter]');
  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);
  expect(await renderedChapters.count()).toBeLessThanOrEqual(5);

  const scrollRoot = page.locator('#reader-scroll-root');
  await scrollRoot.evaluate((element) => {
    const samples: Array<{ path: string; top: number }> = [];
    (
      window as Window & { __readerScrollSamples?: Array<{ path: string; top: number }> }
    ).__readerScrollSamples = samples;
    element.addEventListener(
      'scroll',
      () => samples.push({ path: location.pathname, top: element.scrollTop }),
      { passive: true }
    );
  });
  const initialPath = new URL(page.url()).pathname;
  await expect
    .poll(
      async () => {
        if (new URL(page.url()).pathname === initialPath) {
          await scrollRoot.evaluate((element) => {
            element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
          });
        }
        return new URL(page.url()).pathname;
      },
      { timeout: 10_000 }
    )
    .not.toBe(initialPath);
  await page.waitForTimeout(100);
  const samples = await page.evaluate(
    () =>
      (
        window as Window & {
          __readerScrollSamples?: Array<{ path: string; top: number }>;
        }
      ).__readerScrollSamples ?? []
  );
  const syncedSamples = samples.filter((sample) => sample.path !== initialPath);
  expect(await scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(syncedSamples.every((sample) => sample.top > 0)).toBe(true);

  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);
  expect(await renderedChapters.count()).toBeLessThanOrEqual(5);
});

test('novel detail exposes reading management and chapter navigation landmarks', async ({
  page
}) => {
  await installReaderMocks(page, 4);
  await page.goto('/library/novel-1');
  await expect(page.getByRole('heading', { name: 'Reader parity novel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start reading', exact: true })).toBeVisible();
  await expect(page.locator('#novel-detail-chapter-0')).toBeVisible();
});
