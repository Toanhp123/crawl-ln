import { expect, test, type Page, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';
import { createSourcePluginArchiveFixture } from './source-plugin-archive.fixture';

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
  let projects: ReturnType<typeof createProject>[] = [];

  await page.route('**/api/source-reader/studio/projects**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/source-reader/studio/projects' && method === 'GET') {
      return fulfill(route, projects);
    }
    if (path === '/api/source-reader/studio/projects' && method === 'POST') {
      projects = [project];
      return fulfill(route, project, 201);
    }
    if (path === '/api/source-reader/studio/projects/import' && method === 'POST') {
      const body = request.postDataBuffer();
      expect(body?.includes(Buffer.from('source-plugin-project-source.zip'))).toBe(true);
      expect(body?.includes(Buffer.from('"type":"create-copy"'))).toBe(true);
      projects = [project];
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

  return {
    projectCount: () => projects.length
  };
}

test.describe('desktop Studio workspace', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false
  });

  test('creates a project, switches the activity sidebar and returns to dashboard', async ({
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
    const activityBar = page.locator('[data-studio-activity-bar]');
    const sidebar = page.locator('[data-studio-region="sidebar"]');
    await expect(activityBar).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-studio-sidebar-panel', 'files');
    const filesTab = activityBar.getByRole('tab', { name: 'File Explorer', exact: true });
    await expect(filesTab).toHaveClass(/text-primary/);
    await expect(filesTab).not.toHaveClass(/bg-primary-subtle/);
    const editor = page.locator('[data-studio-region="editor"]');
    await expect(editor).toBeVisible();
    await expect(page.locator('[data-studio-region="inspector"]')).toHaveCount(0);

    const editorLeft = await editor.evaluate((element) => element.getBoundingClientRect().left);
    await page
      .getByRole('separator', { name: 'Resize Studio sidebar', exact: true })
      .press('ArrowRight');
    await expect
      .poll(() => editor.evaluate((element) => element.getBoundingClientRect().left))
      .toBe(editorLeft);

    await activityBar.getByRole('tab', { name: 'File Explorer', exact: true }).click();
    await expect(sidebar).toBeHidden();
    await expect(
      activityBar.getByRole('tab', { name: 'File Explorer', exact: true })
    ).toHaveAttribute('aria-selected', 'false');

    await activityBar.getByRole('tab', { name: 'Metadata', exact: true }).click();
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-studio-sidebar-panel', 'metadata');
    await expect(sidebar.getByRole('heading', { name: 'Metadata', exact: true })).toBeVisible();

    await activityBar.getByRole('tab', { name: 'Metadata', exact: true }).click();
    await expect(sidebar).toBeHidden();
    await expect(sidebar).toHaveAttribute('data-studio-sidebar-panel', 'metadata');

    await activityBar.getByRole('tab', { name: 'Diagnostics', exact: true }).click();
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-studio-sidebar-panel', 'diagnostics');
    await expect(page.locator('[data-studio-region="editor"]')).toBeVisible();

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
    const outputContent = page.locator('[data-studio-output-content]');
    await expect
      .poll(async () => {
        const dockBox = await outputDock.boundingBox();
        const contentBox = await outputContent.boundingBox();
        return Math.abs(
          (dockBox?.y ?? 0) +
            (dockBox?.height ?? 0) -
            ((contentBox?.y ?? 0) + (contentBox?.height ?? 0))
        );
      })
      .toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Clear output', exact: true }).click();
    await expect(
      page.getByText('Output cleared. New operation output will appear here.')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page).not.toHaveURL(/project=/);

    await page.getByRole('button', { name: 'Install package', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Install package' })).toBeVisible();
  });
});

test('mobile Studio switches one visible workspace panel at a time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await mockStudio(page);
  await installE2eRuntime(page);

  await page.goto('/sources/new?project=studio-demo');
  const studioLayout = page.locator('[data-studio-layout-mode]');
  const studioBox = await studioLayout.boundingBox();
  expect(studioBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(480);
  const commandBar = page.locator('[data-studio-command-bar]');
  const actionButtons = ['Build', 'Test sandbox', 'Export package', 'Install build'].map((name) =>
    commandBar.getByRole('button', { name, exact: true })
  );
  const actionRows = await Promise.all(
    actionButtons.map(async (button) => (await button.boundingBox())?.y ?? Number.NaN)
  );
  expect(Math.max(...actionRows) - Math.min(...actionRows)).toBeLessThanOrEqual(1);

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

  const outputToggle = page.getByRole('button', { name: 'Studio output', exact: true });
  await outputToggle.click();
  const outputDock = page.locator('[data-studio-output-dock]');
  const viewport = page.viewportSize();
  const outputBox = await outputDock.boundingBox();
  expect(outputBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    (viewport?.height ?? 0) * 0.45
  );

  await page.getByRole('tab', { name: /Details/ }).click();
  await expect(page.locator('[data-studio-region="inspector"]')).toBeVisible();
  await expect(page.locator('[data-studio-region="files"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="editor"]')).toBeHidden();
  await expect(page.locator('[data-studio-region="files"]')).toHaveCount(1);
  await expect(page.locator('[data-studio-region="editor"]')).toHaveCount(1);
});

test.describe('source archive project import', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false
  });

  test('imports source files into Studio without changing installed plugins', async ({ page }) => {
    const archive = await createSourcePluginArchiveFixture({
      id: 'source-plugin-project',
      name: 'Source Plugin Project'
    });
    const checksum = 'd'.repeat(64);
    let installMutations = 0;
    let pluginListReads = 0;
    const existingPlugin = {
      id: 'existing-reader',
      name: 'Existing Reader',
      latestVersion: '1.0.0',
      activeVersion: '1.0.0',
      trustLevel: 'local-verified',
      status: 'active',
      enabled: true,
      capabilities: ['identify'],
      domains: ['existing.example'],
      permissionsPending: false,
      health: { status: 'healthy' }
    };

    await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
    await installE2eRuntime(page);
    await page.route('**/api/source-reader/**', (route) => fulfill(route, []));
    const studio = await mockStudio(page);
    await page.route('**/api/source-reader/plugins**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (path === '/api/source-reader/plugins/import/inspect' && method === 'POST') {
        return fulfill(route, {
          checksum,
          kind: 'studio-source',
          pluginId: archive.manifest.id,
          name: archive.manifest.name,
          version: archive.manifest.version,
          hosts: archive.manifest.permissions.network.hosts,
          capabilities: archive.manifest.capabilities,
          files: ['manifest.json', 'src/index.ts'],
          ignoredFiles: ['README.md'],
          conflicts: []
        });
      }
      if (path === '/api/source-reader/plugins' && method === 'GET') {
        pluginListReads += 1;
        return fulfill(route, [existingPlugin]);
      }
      if (method === 'POST') installMutations += 1;
      return fulfill(route, []);
    });

    await page.goto('/sources?section=plugins');
    await expect(page.getByText('Existing Reader', { exact: true })).toBeVisible();

    await page.goto('/sources/new');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByRole('radio', { name: 'Import project', exact: true }).click();
    await dialog.getByLabel('Source archive', { exact: true }).setInputFiles({
      name: archive.fileName,
      mimeType: 'application/zip',
      buffer: archive.buffer
    });

    await expect(dialog.getByText('Plugin Studio source', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        'Import validates and saves source files only. It does not build or install the plugin.',
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      dialog.getByRole('radio', { name: /^Create a separate Studio project/ })
    ).toBeChecked();
    await dialog.getByRole('button', { name: 'Import project', exact: true }).click();

    await expect(page).toHaveURL(/project=studio-demo/);
    await expect(page.getByRole('button', { name: /manifest\.json$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'src\/index.ts', exact: true })).toBeVisible();
    expect(studio.projectCount()).toBe(1);
    expect(installMutations).toBe(0);

    await page.goto('/sources?section=plugins');
    await expect(page.getByText('Existing Reader', { exact: true })).toBeVisible();
    await expect(page.getByText('Source Plugin Project', { exact: true })).toHaveCount(0);
    expect(pluginListReads).toBeGreaterThanOrEqual(2);
  });
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
    await page
      .locator('[data-studio-activity-bar]')
      .getByRole('tab', { name: 'File Explorer', exact: true })
      .click();
    await expect(page.locator('[data-studio-region="sidebar"]')).toBeHidden();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toBeVisible();
    await editor.click({ position: { x: 24, y: 24 } });
    await editor.click({ position: { x: 48, y: 24 } });
    await page.waitForTimeout(100);

    expect(errors.filter((message) => /Canceled|clipboardService/i.test(message))).toEqual([]);
  });
});
