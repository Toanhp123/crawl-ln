import { expect, test, type Page, type Route } from '@playwright/test';

const ok = (data: unknown) => ({ data, error: null });

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

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', json: ok(data) });
}

async function mockSourceReader(page: Page, options?: { failDisable?: boolean }) {
  await page.route('**/api/source-reader/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/source-reader/plugins' && method === 'GET') {
      return fulfill(route, [plugin]);
    }
    if (path === '/api/source-reader/credentials' && method === 'GET') {
      return fulfill(route, []);
    }
    if (path === '/api/source-reader/network-profiles' && method === 'GET') {
      return fulfill(route, []);
    }
    if (path === '/api/source-reader/auth/challenges' && method === 'GET') {
      return fulfill(route, []);
    }
    if (path === '/api/source-reader/plugins/novelcool/disable' && method === 'POST') {
      if (options?.failDisable) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          json: {
            data: null,
            error: { code: 'PLUGIN_UNAVAILABLE', message: 'failed', details: null }
          }
        });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/source-reader/identify' && method === 'POST') {
      return fulfill(route, {
        data: {
          normalizedUrl: 'https://novelcool.com/novel/example',
          domain: 'novelcool.com',
          pageType: 'novel'
        },
        source: {
          pluginId: 'novelcool',
          pluginVersion: '1.0.0',
          domain: 'novelcool.com',
          capability: 'identify'
        }
      });
    }
    return fulfill(route, []);
  });
}

test('Sources page loads Source Reader plugins and rolls back a failed switch', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await mockSourceReader(page, { failDisable: true });

  await page.goto('/sources');
  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
});

test('Sources console navigates all sections and runs the Source Inspector', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await mockSourceReader(page);

  await page.goto('/sources?section=credentials');
  await expect(page.getByRole('heading', { name: 'Credential profiles' })).toBeVisible();

  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await expect(page).toHaveURL(/section=network/);
  await expect(page.getByRole('heading', { name: 'Network profiles', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Challenges', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Authentication challenges', exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Source Inspector', exact: true })).toBeVisible();
  await page.getByLabel('Source URL', { exact: true }).fill('https://novelcool.com/novel/example');
  await page.getByRole('button', { name: 'Run operation', exact: true }).click();
  await expect(page.getByText('novelcool.com', { exact: true })).toBeVisible();
  await expect(page.getByText(/novelcool@1\.0\.0/).first()).toBeVisible();
});
