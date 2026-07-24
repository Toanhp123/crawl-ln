import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Appearance uses three wrapping choice groups and owns no App Font state', async () => {
  const [model, ui, catalog] = await Promise.all([
    readFile(
      'apps/web/src/features/configure-appearance/model/use-appearance-configuration.ts',
      'utf8'
    ),
    readFile('apps/web/src/features/configure-appearance/ui/AppearanceControls.tsx', 'utf8'),
    readFile('apps/web/src/features/configure-appearance/i18n/catalog.ts', 'utf8')
  ]);
  assert.match(model, /summary/);
  assert.doesNotMatch(model, /appFont|setAppFont/);
  assert.equal((ui.match(/<SettingsChoiceGroup/g) ?? []).length, 3);
  assert.match(ui, /Monitor/);
  assert.match(ui, /Moon/);
  assert.match(ui, /Sun/);
  assert.doesNotMatch(ui, /SegmentedControl|appearance\.font/);
  assert.doesNotMatch(catalog, /appearance\.(?:font|small|medium|large|extra-large)/);
});

test('Language uses full-width option rows and exposes the translated current label', async () => {
  const [model, ui] = await Promise.all([
    readFile(
      'apps/web/src/features/configure-language/model/use-language-configuration.ts',
      'utf8'
    ),
    readFile('apps/web/src/features/configure-language/ui/LanguageControls.tsx', 'utf8')
  ]);
  assert.match(model, /currentLabel/);
  assert.match(model, /items/);
  assert.match(ui, /SettingsOptionList/);
  assert.doesNotMatch(ui, /SegmentedControl/);
});
