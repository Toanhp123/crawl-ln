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

test('reader keeps loaded chapters mounted while the URL follows continuous scrolling', async ({
  page
}) => {
  await installReaderMocks(page);
  await page.goto('/library/novel-1/read/0');
  const renderedChapters = page.locator('#reader-content section[data-reader-chapter]');
  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);

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
  for (let target = 1; target <= 6; target += 1) {
    await expect
      .poll(
        async () => {
          await scrollRoot.evaluate((element) => {
            element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
          });
          return Number(new URL(page.url()).pathname.split('/').at(-1));
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(target);
  }
  await page.waitForTimeout(100);
  const samples = await page.evaluate(
    () =>
      (
        window as Window & {
          __readerScrollSamples?: Array<{ path: string; top: number }>;
        }
      ).__readerScrollSamples ?? []
  );
  const syncedSamples = samples.filter((sample) => !sample.path.endsWith('/0'));
  expect(await scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(syncedSamples.every((sample) => sample.top > 0)).toBe(true);

  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(5);
  await expect(renderedChapters.filter({ has: page.locator('#reader-chapter-0') })).toHaveCount(1);
});

test('reader prepends the previous chapter without moving the opened chapter', async ({ page }) => {
  await installReaderMocks(page);
  await page.goto('/library/novel-1/read/10');
  const scrollRoot = page.locator('#reader-scroll-root');
  const openedChapter = page.locator('#reader-chapter-10');
  await expect(openedChapter).toBeVisible();
  await expect.poll(() => page.locator('#reader-chapter-9').count()).toBe(1);

  const offset = await openedChapter.evaluate((chapter, viewport) => {
    const viewportElement = document.querySelector<HTMLElement>(String(viewport));
    if (!viewportElement) return Number.POSITIVE_INFINITY;
    return chapter.getBoundingClientRect().top - viewportElement.getBoundingClientRect().top;
  }, '#reader-scroll-root');
  expect(Math.abs(offset)).toBeLessThan(16);
  expect(await scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
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
