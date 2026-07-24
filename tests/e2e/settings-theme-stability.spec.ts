import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { installE2eRuntime } from './runtime.fixture';

const envelope = (data: unknown) => JSON.stringify({ data, error: null });

async function installSettingsApi(page: Page): Promise<void> {
  await page.route('**/api/scheduler/status', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        running: true,
        tickIntervalMs: 60_000,
        monitoredNovels: 2,
        dueNovels: 0,
        activeRuns: 0
      })
    })
  );
}

async function openSettings(
  page: Page,
  options: {
    width: number;
    height: number;
    theme?: 'system' | 'dark' | 'light';
    density?: 'compact' | 'comfortable';
    appFont?: 'small' | 'medium' | 'large' | 'extra-large';
  }
): Promise<void> {
  await page.setViewportSize({ width: options.width, height: options.height });
  await page.addInitScript((settings) => {
    localStorage.setItem('novel-tool-language', 'en');
    localStorage.setItem('novel-tool-theme', settings.theme ?? 'system');
    localStorage.setItem('novel-tool-accent', 'indigo');
    localStorage.setItem('novel-tool-density', settings.density ?? 'compact');
    localStorage.setItem('novel-tool-app-font', settings.appFont ?? 'medium');
  }, options);
  await installSettingsApi(page);
  await installE2eRuntime(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function expectMinimumHeight(locator: Locator, minimum: number): Promise<void> {
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await locator.nth(index).boundingBox();
    expect(box, `missing box for item ${index}`).not.toBeNull();
    expect(box!.height, `item ${index} height`).toBeGreaterThanOrEqual(minimum);
  }
}

async function expectWithinViewport(page: Page, locator: Locator): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined))
    );
  });
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test('mobile Settings hub keeps three compact preference cards', async ({ page }) => {
  await openSettings(page, { width: 360, height: 800 });
  const cards = page.locator('[data-settings-preferences-grid] [data-settings-hub-card]');
  await expect(cards).toHaveCount(3);
  await expectMinimumHeight(cards, 44);
  await expect(page.locator('[data-settings-hub-card="appearance"]')).toContainText(
    'System · Indigo · Compact · Medium'
  );
  await expect(page.locator('[data-settings-hub-card="language"]')).toContainText('English');
  await expect(cards.locator('svg.lucide-chevron-right')).toHaveCount(3);
  await page.locator('[data-settings-preferences-grid]').scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot('settings-hub-mobile.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
    fullPage: true
  });
});

test('Appearance choice chips stay large, wrap, and support arrow navigation', async ({ page }) => {
  await openSettings(page, { width: 360, height: 800 });
  await page.locator('[data-settings-hub-card="appearance"]').click();
  const dialog = page.getByRole('dialog', { name: 'Appearance' });
  await expect(dialog).toBeVisible();
  await expectWithinViewport(page, dialog);
  await expect(dialog.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Accent' })).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Density' })).toBeVisible();
  await expectMinimumHeight(dialog.getByRole('radio'), 44);

  const system = dialog.getByRole('radio', { name: 'System' });
  await system.focus();
  await system.press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  const blue = dialog.getByRole('radio', { name: 'Blue' });
  await blue.focus();
  await blue.press('Space');
  await expect(blue).toHaveAttribute('aria-checked', 'true');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveScreenshot('appearance-sheet-mobile.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02
  });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-settings-hub-card="appearance"]')).toContainText(
    'Dark · Blue · Compact · Medium'
  );
});

test('Language uses full rows, remains open, and translates immediately', async ({ page }) => {
  await openSettings(page, { width: 412, height: 915, density: 'comfortable' });
  await page.locator('[data-settings-hub-card="language"]').click();
  const englishDialog = page.getByRole('dialog', { name: 'Language' });
  await expectWithinViewport(page, englishDialog);
  const english = englishDialog.getByRole('radio', { name: 'English' });
  await expectMinimumHeight(englishDialog.getByRole('radio'), 60);
  await english.focus();
  await english.press('ArrowRight');
  const vietnameseDialog = page.getByRole('dialog', { name: 'Ngôn ngữ' });
  await expect(vietnameseDialog).toBeVisible();
  await expect(vietnameseDialog.getByRole('radio', { name: 'Tiếng Việt' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  const englishInVietnamese = vietnameseDialog.getByRole('radio', { name: 'Tiếng Anh' });
  await englishInVietnamese.focus();
  await englishInVietnamese.press('Enter');
  const translatedBack = page.getByRole('dialog', { name: 'Language' });
  const vietnamese = translatedBack.getByRole('radio', { name: 'Vietnamese' });
  await vietnamese.focus();
  await vietnamese.press('Space');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('novel-tool-language')))
    .toBe('vi');
  const finalDialog = page.getByRole('dialog', { name: 'Ngôn ngữ' });
  await expect(finalDialog).toBeVisible();
  await expect(page).toHaveScreenshot('language-sheet-mobile.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02
  });
  await finalDialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.locator('[data-settings-hub-card="language"]')).toContainText('Tiếng Việt');
});

test('App Font preview uses the live typography contract and four choices wrap safely', async ({
  page
}) => {
  await openSettings(page, { width: 360, height: 800, theme: 'light' });
  await page.locator('[data-settings-hub-card="appearance"]').click();
  const dialog = page.getByRole('dialog', { name: 'Appearance' });
  await expectWithinViewport(page, dialog);
  const choices = dialog
    .getByRole('radiogroup', { name: 'Application font size' })
    .getByRole('radio');
  await expect(choices).toHaveCount(4);
  await expectMinimumHeight(choices, 44);
  const choiceTops = await choices.evaluateAll((items) =>
    items.map((item) => Math.round(item.getBoundingClientRect().top))
  );
  expect(new Set(choiceTops).size).toBeGreaterThan(1);
  const preview = dialog.locator('[data-app-font-preview]');
  const before = await preview
    .locator('p')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const extraLarge = dialog.getByRole('radio', { name: 'Extra large' });
  await extraLarge.focus();
  await extraLarge.press('Space');
  const after = await preview
    .locator('p')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(after).toBeGreaterThan(before);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('novel-tool-app-font')))
    .toBe('extra-large');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await expect(page).toHaveScreenshot('app-font-sheet-mobile.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02
  });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-settings-hub-card="appearance"]')).toContainText('Extra large');
});

test('Reader segmented controls remain usable after the shared height and auto-layout fix', async ({
  page
}) => {
  await openSettings(page, { width: 412, height: 915, appFont: 'extra-large' });
  await page.locator('[data-settings-hub-card="reader"]').click();
  const dialog = page.getByRole('dialog', { name: 'Reader preferences' });
  await expectWithinViewport(page, dialog);
  await expectMinimumHeight(dialog.locator('[data-segmented-item]'), 44);
  const auto = dialog.locator('[data-segmented-columns="auto"]');
  await expect(auto).toHaveCount(1);
  expect(await auto.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  const tops = await auto
    .locator('[data-segmented-item]')
    .evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBeGreaterThan(1);
  await expect(dialog.getByRole('button', { name: 'Reset' })).toBeVisible();
});

test('desktop keeps a three-card grid with the same feature language', async ({ page }) => {
  await openSettings(page, { width: 1280, height: 900, theme: 'light' });
  const cards = page.locator('[data-settings-preferences-grid] [data-settings-hub-card]');
  await expect(cards).toHaveCount(3);
  const tops = await cards.evaluateAll((items) =>
    items.map((item) => Math.round(item.getBoundingClientRect().top))
  );
  expect(new Set(tops).size).toBe(1);
  await expect(page).toHaveScreenshot('settings-hub-desktop.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
    fullPage: true
  });
});
