import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Settings composes three preference cards and nests App Font inside Appearance', async () => {
  const source = await readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8');
  assert.match(source, /useAppearanceConfiguration/);
  assert.match(source, /useLanguageConfiguration/);
  assert.match(source, /useAppFontConfiguration/);
  assert.match(source, /md:grid-cols-3/);
  assert.doesNotMatch(source, /xl:grid-cols-4/);
  for (const id of ['appearance', 'language', 'reader']) {
    assert.ok(source.includes('cardId="' + id + '"'));
  }
  assert.doesNotMatch(source, /cardId=["']appFont["']/);
  assert.doesNotMatch(source, /panel === ["']appFont["']/);
  assert.match(source, /currentValue=\{\`\$\{appearance\.summary\} · \$\{appFont\.currentLabel\}\`\}/);
  assert.match(source, /panel === 'appearance'[\s\S]*?<AppearanceControls \/>[\s\S]*?<AppFontControls \/>/);
  assert.match(source, /currentValue=\{language\.currentLabel\}/);
});

test('App Font remains feature-owned while Appearance owns its sheet composition', async () => {
  const [settings, controls, catalog] = await Promise.all([
    readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8'),
    readFile('apps/web/src/features/configure-app-font/ui/AppFontControls.tsx', 'utf8'),
    readFile('apps/web/src/features/configure-app-font/i18n/catalog.ts', 'utf8')
  ]);
  assert.match(settings, /<AppFontControls \/>/);
  assert.match(controls, /data-app-font-preview/);
  assert.match(controls, /SettingsChoiceGroup/);
  assert.match(catalog, /appFont\.previewTitle/);
  assert.match(catalog, /appFont\.extra-large/);
});
