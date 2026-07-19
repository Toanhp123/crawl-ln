import { expect, test } from '@playwright/test';

test('opens the mobile app shell and navigates between primary pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();

  const navigation = page.getByRole('navigation');
  await expect(navigation).toBeVisible();

  await page.getByRole('link', { name: /library|thư viện/i }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.getByRole('link', { name: /settings|cài đặt/i }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
