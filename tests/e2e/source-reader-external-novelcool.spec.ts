import { expect, test, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';
import { createSourcePluginArchiveFixture } from './source-plugin-archive.fixture';

const ok = (data: unknown) => ({ data, error: null });

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', json: ok(data) });
}

test('installs, approves and enables the generated NovelCool external plugin', async ({ page }) => {
  const archive = await createSourcePluginArchiveFixture({
    id: 'novelcool',
    name: 'NovelCool',
    version: '1.0.0',
    hosts: ['novelcool.com'],
    capabilities: ['identify', 'metadata', 'chapter-list', 'chapter-content']
  });
  const checksum = 'c'.repeat(64);
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await installE2eRuntime(page);

  let installed = false;
  let approved = false;
  let enabled = false;
  const descriptor = () => ({
    id: 'novelcool',
    name: 'NovelCool',
    latestVersion: '1.0.0',
    ...(enabled ? { activeVersion: '1.0.0' } : {}),
    trustLevel: 'local-unverified',
    status: enabled ? 'active' : 'installed',
    enabled,
    capabilities: ['identify', 'metadata', 'chapter-list', 'chapter-content'],
    domains: ['novelcool.com'],
    permissionsPending: installed && !approved,
    health: { status: enabled ? 'healthy' : 'unknown' }
  });

  await page.route('**/api/source-reader/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/source-reader/plugins/import/inspect' && method === 'POST') {
      expect(request.headers()['content-type']).toContain('multipart/form-data');
      expect(request.postDataBuffer()?.includes(Buffer.from(archive.fileName))).toBe(true);
      return json(route, {
        checksum,
        kind: 'studio-source',
        pluginId: 'novelcool',
        name: 'NovelCool',
        version: '1.0.0',
        hosts: ['novelcool.com'],
        capabilities: ['identify', 'metadata', 'chapter-list', 'chapter-content'],
        files: ['manifest.json', 'src/index.ts'],
        ignoredFiles: ['README.md'],
        conflicts: []
      });
    }
    if (path === '/api/source-reader/plugins/import/install' && method === 'POST') {
      const body = request.postDataBuffer();
      expect(body?.includes(Buffer.from(archive.fileName))).toBe(true);
      expect(body?.includes(Buffer.from(checksum))).toBe(true);
      installed = true;
      return json(route, { ...descriptor(), status: 'pending-approval' }, 202);
    }
    if (path === '/api/source-reader/plugins/install' && method === 'POST') {
      throw new Error('Source archive install must not use the legacy package endpoint');
    }
    if (path === '/api/source-reader/plugins' && method === 'GET') {
      const installedDescriptor = descriptor();
      if (!enabled) expect(installedDescriptor).not.toHaveProperty('activeVersion');
      return json(route, installed ? [installedDescriptor] : []);
    }
    if (path === '/api/source-reader/plugins/novelcool' && method === 'GET') {
      return json(route, {
        pluginId: 'novelcool',
        ...(enabled ? { activeVersion: '1.0.0' } : {}),
        status: enabled ? 'active' : 'installed',
        lifecycleState: enabled ? 'running' : 'installed',
        runtimeVersion: '1.0.0',
        sandboxProtocolVersion: 1,
        compatibilityIssues: [],
        policy: { processStartTimeoutMs: 10_000, violationThreshold: 3 }
      });
    }
    if (path === '/api/source-reader/plugins/novelcool/health' && method === 'GET') {
      return json(route, {
        pluginId: 'novelcool',
        status: enabled ? 'active' : 'installed',
        lifecycleState: enabled ? 'running' : 'installed',
        runtimeVersion: '1.0.0',
        sandboxProtocolVersion: 1,
        compatibilityIssues: [],
        policy: { processStartTimeoutMs: 10_000, violationThreshold: 3 },
        lastHealth: {
          status: enabled ? 'healthy' : 'unknown',
          checkedAt: '2026-07-26T00:00:00.000Z'
        }
      });
    }
    if (path === '/api/source-reader/plugins/novelcool/permissions' && method === 'GET') {
      return json(route, [
        {
          permission: 'network',
          scope: { hosts: ['novelcool.com', '*.novelcool.com'] },
          status: approved ? 'approved' : 'pending'
        }
      ]);
    }
    if (path === '/api/source-reader/plugins/novelcool/permissions/approve' && method === 'POST') {
      expect(request.postDataJSON()).toEqual({ version: '1.0.0' });
      approved = true;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/source-reader/plugins/novelcool/enable' && method === 'POST') {
      expect(approved).toBe(true);
      expect(request.postDataJSON()).toEqual({ version: '1.0.0' });
      enabled = true;
      return json(route, { pluginId: 'novelcool', version: '1.0.0', status: 'active' });
    }
    return json(route, []);
  });

  await page.goto('/sources/new');
  await expect(page.getByText('No saved Studio projects', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Install package', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Install package' })).toBeVisible();
  await page.getByLabel('Plugin package', { exact: true }).setInputFiles({
    name: archive.fileName,
    mimeType: 'application/zip',
    buffer: archive.buffer
  });
  await expect(page.getByText('Plugin Studio source', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'This source archive will be built temporarily for installation. No Studio project will be created.',
      { exact: true }
    )
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm installation', exact: true }).click();
  await expect(page).toHaveURL(/\/sources\?section=plugins/);
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();

  await page.goto('/sources/new');
  await expect(page.getByText('No saved Studio projects', { exact: true })).toBeVisible();
  await page.goto('/sources?section=plugins');

  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByText('Local, unverified', { exact: true })).toBeVisible();
  await expect(page.getByText('1.0.0', { exact: true })).toBeVisible();
  const toggle = page.getByRole('switch', { name: /^Enable NovelCool/ });
  const testPlugin = page.getByRole('button', { name: 'Test plugin', exact: true });
  await expect(toggle).toBeDisabled();
  await expect(testPlugin).toBeDisabled();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(testPlugin).toBeEnabled();
});
