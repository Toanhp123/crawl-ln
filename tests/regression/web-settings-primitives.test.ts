import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

test('SettingsChoiceGroup renders a labeled wrapping radio group with one selected item', async () => {
  const { SettingsChoiceGroup } =
    await import('../../apps/web/src/shared/ui/settings/SettingsChoiceGroup.tsx');
  const html = renderToStaticMarkup(
    createElement(SettingsChoiceGroup, {
      label: 'Theme',
      value: 'system',
      layout: 'balanced',
      items: [
        { id: 'system', label: 'System' },
        { id: 'dark', label: 'Dark' },
        { id: 'light', label: 'Light', disabled: true }
      ],
      onChange() {}
    })
  );
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /data-settings-choice-group/);
  assert.match(html, /data-settings-choice-layout="balanced"/);
  assert.match(html, /basis-\[calc\(50%-var\(--space-1\)\)\]/);
  assert.match(html, /disabled=""/);
  assert.match(html, /min-h-\[var\(--control-touch-min\)\]/);
});

test('SettingsOptionList renders one button-radio per row without nested controls', async () => {
  const { SettingsOptionList } =
    await import('../../apps/web/src/shared/ui/settings/SettingsOptionList.tsx');
  const html = renderToStaticMarkup(
    createElement(SettingsOptionList, {
      ariaLabel: 'Language',
      value: 'en',
      items: [
        { id: 'en', label: 'English' },
        { id: 'vi', label: 'Tiếng Việt' },
        { id: 'fr', label: 'Français', disabled: true }
      ],
      onChange() {}
    })
  );
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.match(html, /min-h-\[var\(--setting-row-height\)\]/);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
  assert.match(html, /disabled=""/);
});

test('settings primitives own radio semantics without changing generic ListRow policy', async () => {
  const [choice, options, listRow] = await Promise.all([
    readFile('apps/web/src/shared/ui/settings/SettingsChoiceGroup.tsx', 'utf8'),
    readFile('apps/web/src/shared/ui/settings/SettingsOptionList.tsx', 'utf8'),
    readFile('apps/web/src/shared/ui/data-display/ListRow.tsx', 'utf8')
  ]);
  assert.match(choice, /nextEnabledIndex/);
  assert.match(options, /nextEnabledIndex/);
  assert.doesNotMatch(listRow, /radiogroup|aria-checked/);
});
