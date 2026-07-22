import { expect, test } from '@playwright/test';

test('opens the mobile app shell and navigates between primary pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();

  const navigation = page.locator('nav:visible', {
    has: page.locator('a[href="/library"]')
  });
  await expect(navigation).toHaveCount(1);

  await navigation.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);

  await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
