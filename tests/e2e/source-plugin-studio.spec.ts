import { expect, test, type Page, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const ok = (data: unknown) => ({ data, error: null });

const manifest = JSON.stringify(
  {
    pluginId: 'demo-reader',
    name: 'Demo Reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['identify', 'metadata']
  },
  null,
  2
);

function createProject() {
  return {
    id: 'studio-demo',
    name: 'Demo Reader',
    pluginId: 'demo-reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['identify', 'metadata'],
    selectors: { title: 'title' },
    files: { 'manifest.json': manifest, 'src/index.ts': 'export default {}' },
    revision: 1,
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', json: ok(data) });
}

async function mockStudio(page: Page) {
  let project = createProject();

  await page.route('**/api/source-reader/studio/projects**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/source-reader/studio/projects' && method === 'GET') {
      return fulfill(route, []);
    }
    if (path === '/api/source-reader/studio/projects' && method === 'POST') {
      return fulfill(route, project, 201);
    }
    if (path.endsWith('/studio-demo') && method === 'GET') {
      return fulfill(route, project);
    }
    if (path.endsWith('/studio-demo') && method === 'PATCH') {
      const body = request.postDataJSON() as { files?: Record<string, string> };
      project = {
        ...project,
        files: body.files ?? project.files,
        revision: project.revision + 1,
        updatedAt: '2026-07-28T00:01:00.000Z'
      };
      return fulfill(route, project);
    }
    return fulfill(route, project);
  });
}

test.describe('desktop Studio workspace', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false
  });

  test('creates a project, opens the three-region workspace and returns to dashboard', async ({
    page
  }) => {
    await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
    await mockStudio(page);
    await installE2eRuntime(page);

    await page.goto('/sources/new');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New project' })).toBeVisible();
    await page.getByLabel('Plugin name', { exact: true }).fill('Discarded draft');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await expect(page.getByLabel('Plugin name', { exact: true })).toHaveValue('My Source');
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();

    await expect(page).toHaveURL(/project=studio-demo/);
    await expect(page.locator('[data-studio-region="files"]')).toBeVisible();
    await expect(page.locator('[data-studio-region="editor"]')).toBeVisible();
    await expect(page.locator('[data-studio-region="inspector"]')).toBeVisible();

    await page.getByRole('button', { name: 'Collapse file explorer', exact: true }).click();
    await expect(page.locator('[data-studio-region="files"]')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
    await page.getByRole('button', { name: 'File Explorer', exact: true }).click();
    await expect(page.locator('[data-studio-region="files"]')).not.toHaveAttribute(
      'data-collapsed'
    );

    await page.getByRole('button', { name: 'Collapse details panel', exact: true }).click();
    await expect(page.locator('[data-studio-region="inspector"]')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
    await page.getByRole('button', { name: 'Diagnostics', exact: true }).last().click();
    await expect(page.locator('[data-studio-region="inspector"]')).not.toHaveAttribute(
      'data-collapsed'
    );

    const outputToggle = page.getByRole('button', { name: 'Studio output', exact: true });
    await expect(outputToggle).toHaveAttribute('aria-expanded', 'false');
    await outputToggle.click();
    await expect(outputToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Copy output', exact: true })).toBeVisible();
    const outputDock = page.locator('[data-studio-output-dock]');
    const outputHeight = await outputDock.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    await page
      .getByRole('separator', { name: 'Resize output panel', exact: true })
      .press('ArrowUp');
    await expect
      .poll(() => outputDock.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(outputHeight);
    await page.getByRole('button', { name: 'Clear output', exact: true }).click();
    await expect(
      page.getByText('Output cleared. New operation output will appear here.')
    ).toBeVisible();

    await page.getByRole('tab', { name: /Diagnostics/ }).click();
    await expect(page.getByRole('tabpanel', { name: /Diagnostics/ })).toBeVisible();
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page).not.toHaveURL(/project=/);

    await page.getByRole('button', { name: 'Install package', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Install package' })).toBeVisible();
  });
});

test('mobile Studio switches one visible workspace panel at a time', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await mockStudio(page);
  await installE2eRuntime(page);

  await page.goto('/sources/new?project=studio-demo');
  await expect(page.locator('[data-studio-region="editor"]')).toBeVisible();
  await expect(page.locator('[data-studio-region="files"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="inspector"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="files"]')).toHaveCount(1);
  await expect(page.locator('[data-studio-region="inspector"]')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.locator('[data-studio-region="files"]')).toBeVisible();
  await expect(page.locator('[data-studio-region="editor"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="editor"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'src/index.ts', exact: true }).click();
  await expect(page.locator('[data-studio-region="editor"]')).toBeVisible();
  await expect(page.locator('[data-studio-region="files"]')).toBeHidden();

  await page.getByRole('tab', { name: /Details/ }).click();
  await expect(page.locator('[data-studio-region="inspector"]')).toBeVisible();
  await expect(page.locator('[data-studio-region="files"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="editor"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="files"]')).toHaveCount(1);
  await expect(page.locator('[data-studio-region="editor"]')).toHaveCount(1);
});

test.describe('WebKit-style clipboard behavior', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  });

  test('does not log Monaco clipboard cancellation errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
    await mockStudio(page);
    await installE2eRuntime(page);

    await page.goto('/sources/new?project=studio-demo');
    await expect(page.locator('[data-studio-region="editor"]')).toBeVisible();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toBeVisible();
    await editor.click({ position: { x: 24, y: 24 } });
    await editor.click({ position: { x: 48, y: 24 } });
    await page.waitForTimeout(100);

    expect(errors.filter((message) => /Canceled|clipboardService/i.test(message))).toEqual([]);
  });
});
