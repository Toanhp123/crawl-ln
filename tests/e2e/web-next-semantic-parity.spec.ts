import { expect, test, type Page, type Route } from '@playwright/test';

const ok = (data: unknown) => ({ data, error: null });

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', json: ok(data) });
}

async function installParityMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/novels')
      return fulfill(route, { items: [], total: 0, limit: 12, offset: 0 });
    if (path === '/api/tasks/summary') return fulfill(route, { running: 0, queued: 0, recent: 0 });
    if (path === '/api/scheduler/status') {
      return fulfill(route, { running: true, monitoredNovels: 0, dueNovels: 0, activeRuns: 0 });
    }
    if (path === '/api/source-reader/plugins') return fulfill(route, []);
    if (path === '/api/source-reader/credentials') return fulfill(route, []);
    if (path === '/api/source-reader/network-profiles') return fulfill(route, []);
    if (path === '/api/source-reader/auth/challenges') return fulfill(route, []);
    return fulfill(route, []);
  });
}

async function primaryLandmarks(page: Page) {
  return page.locator('main, nav, header, [role="navigation"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role'),
      label: node.getAttribute('aria-label')
    }))
  );
}

function primaryNavigation(page: Page) {
  return page.locator('nav:visible', { has: page.locator('a[href="/library"]') });
}

for (const path of ['/library', '/activity', '/sources', '/settings']) {
  test(`current and next mobile screens expose matching primary landmarks for ${path}`, async ({
    browser
  }) => {
    const current = await browser.newPage();
    const next = await browser.newPage();
    await installParityMocks(current);
    await installParityMocks(next);
    await current.goto(`http://127.0.0.1:4173${path}`);
    await next.goto(`http://127.0.0.1:4174${path}`);
    await expect(current.locator('main header')).toBeVisible();
    await expect(next.locator('main header')).toBeVisible();
    await expect(primaryNavigation(current)).toHaveCount(1);
    await expect(primaryNavigation(next)).toHaveCount(1);
    await expect(next.locator('aside')).toBeHidden();
    expect(await primaryLandmarks(next)).toEqual(await primaryLandmarks(current));
    if (path === '/sources') {
      const currentSourcesNavigation = current.locator(
        'div[role="navigation"][aria-label]:visible'
      );
      const nextSourcesNavigation = next.locator('div[role="navigation"][aria-label]:visible');
      const currentLabel = await currentSourcesNavigation.getAttribute('aria-label');
      expect(currentLabel).toBe('Ngu\u1ed3n truy\u1ec7n');
      expect(await nextSourcesNavigation.getAttribute('aria-label')).toBe(currentLabel);
    }
    await current.close();
    await next.close();
  });
}
