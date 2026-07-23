import { expect, test } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

test('opens the mobile app shell and navigates between primary pages', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('novel-tool-language', 'en');
    localStorage.setItem('another-product-token', 'keep');
    sessionStorage.setItem('another-product-session', 'keep');
  });
  await installE2eRuntime(page);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.getItem('another-product-token'),
      session: sessionStorage.getItem('another-product-session')
    }))
  ).toEqual({ local: 'keep', session: 'keep' });

  const navigation = page.locator('nav:visible', {
    has: page.locator('a[href="/library"]')
  });
  await expect(navigation).toHaveCount(1);

  await navigation.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);

  await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
