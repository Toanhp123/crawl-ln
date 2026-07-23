import { expect, test } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const secret = 'SERVER_SIDE_SECRET_MARKER_9f31';
const ok = (data: unknown) => ({ data, error: null });

test('remediated Sources UI shows safe quarantine and diagnostics without secret leakage', async ({
  page
}) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await page.route('**/api/source-reader/plugins', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: ok([
        {
          id: 'unsafe-demo',
          name: 'Unsafe Demo',
          activeVersion: '1.0.0',
          trustLevel: 'local-unverified',
          status: 'quarantined',
          enabled: false,
          capabilities: ['metadata'],
          domains: ['example.test'],
          permissionsPending: false,
          health: { status: 'failed' }
        }
      ])
    })
  );
  for (const endpoint of ['credentials', 'network-profiles', 'auth/challenges']) {
    await page.route(`**/api/source-reader/${endpoint}`, (route) =>
      route.fulfill({ contentType: 'application/json', json: ok([]) })
    );
  }
  await page.route('**/api/source-reader/plugins/unsafe-demo', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: ok({
        pluginId: 'unsafe-demo',
        status: 'quarantined',
        lifecycleState: 'quarantined',
        runtimeVersion: '1.0.0',
        sandboxProtocolVersion: 1,
        compatibilityIssues: [
          {
            code: 'PLUGIN_PACKAGE_INVALID',
            path: 'package',
            severity: 'fatal',
            message: 'Package failed validation'
          }
        ],
        policy: { processStartTimeoutMs: 10000, violationThreshold: 3 }
      })
    })
  );
  await page.route('**/api/source-reader/plugins/unsafe-demo/enable', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      json: {
        data: null,
        error: {
          code: 'PLUGIN_PACKAGE_INVALID',
          message: 'Plugin activation failed',
          details: null
        }
      }
    })
  );
  await page.route('**/api/source-reader/network-profiles/route-1/test', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      json: {
        data: null,
        error: {
          code: 'NETWORK_ROUTE_TEST_FAILED',
          message: 'Network route test failed',
          details: null
        }
      }
    })
  );

  await installE2eRuntime(page);
  await page.goto('/sources');
  await expect(page.getByText('Unsafe Demo', { exact: true })).toBeVisible();
  await expect(page.getByText('Quarantined', { exact: true })).toBeVisible();

  const diagnostics = await page.evaluate(async () => {
    const response = await fetch('/api/source-reader/plugins/unsafe-demo');
    return response.text();
  });
  expect(diagnostics).toContain('PLUGIN_PACKAGE_INVALID');
  expect(diagnostics).not.toContain(secret);
  expect(diagnostics).not.toContain('packagePath');
  expect(diagnostics).not.toContain('checksum');

  const routeFailure = await page.evaluate(async () => {
    const response = await fetch('/api/source-reader/network-profiles/route-1/test', {
      method: 'POST'
    });
    return response.text();
  });
  expect(routeFailure).toContain('NETWORK_ROUTE_TEST_FAILED');
  expect(routeFailure).not.toContain(secret);

  const toggle = page.getByRole('switch', { name: 'Enable Unsafe Demo', exact: true });
  await toggle.click();
  await expect(page.getByText('Plugin update failed', { exact: true })).toBeVisible();
  await expect(page.getByText('PLUGIN_PACKAGE_INVALID', { exact: true })).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);

  const screenshot = await page.screenshot();
  expect(screenshot.toString('latin1')).not.toContain(secret);
});
