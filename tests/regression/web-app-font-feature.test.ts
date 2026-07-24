import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('App Font is a provider-backed feature with a real typography preview', async () => {
  const feature = await import('../../apps/web/src/features/configure-app-font/index.ts');
  assert.equal(typeof feature.useAppFontConfiguration, 'function');
  assert.equal(typeof feature.AppFontControls, 'function');
  assert.equal((await stat('apps/web/src/features/configure-app-font/index.ts')).isFile(), true);

  const [model, ui] = await Promise.all([
    readFile(
      'apps/web/src/features/configure-app-font/model/use-app-font-configuration.ts',
      'utf8'
    ),
    readFile('apps/web/src/features/configure-app-font/ui/AppFontControls.tsx', 'utf8')
  ]);
  assert.match(model, /useAppTheme/);
  assert.match(model, /useI18n/);
  assert.doesNotMatch(model, /localStorage|document\.documentElement/);
  assert.match(ui, /SettingsChoiceGroup/);
  assert.match(ui, /data-app-font-preview/);
  assert.doesNotMatch(ui, /fontSize\s*:/);
});

test('application catalog composes App Font translations', async () => {
  const source = await readFile('apps/web/src/app/i18n/catalog.ts', 'utf8');
  assert.match(source, /configureAppFontCatalogs/);
});
