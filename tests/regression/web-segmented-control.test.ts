import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

test('radio navigation wraps and skips disabled items', async () => {
  const { nextEnabledIndex } =
    await import('../../apps/web/src/shared/ui/forms/radio-navigation.ts');
  const items = [{}, { disabled: true }, {}, { disabled: true }];
  assert.equal(nextEnabledIndex(items, 0, 1), 2);
  assert.equal(nextEnabledIndex(items, 2, 1), 0);
  assert.equal(nextEnabledIndex(items, 0, -1), 2);
  assert.equal(nextEnabledIndex([{ disabled: true }], 0, 1), 0);
});

test('segmented control exposes radio semantics, auto columns, and touch sizing', async () => {
  const { SegmentedControl } =
    await import('../../apps/web/src/shared/ui/forms/SegmentedControl.tsx');
  const html = renderToStaticMarkup(
    createElement(SegmentedControl, {
      value: 'a',
      columns: 'auto',
      ariaLabel: 'Example',
      items: [
        { id: 'a', label: 'First' },
        { id: 'b', label: 'A much longer second label' },
        { id: 'c', label: 'Disabled', disabled: true }
      ],
      onChange() {}
    })
  );
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /data-segmented-columns="auto"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /disabled=""/);

  const source = await readFile('apps/web/src/shared/ui/forms/SegmentedControl.tsx', 'utf8');
  assert.match(source, /max\(var\(--control-touch-min\),var\(--setting-choice-height\)\)/);
  assert.match(source, /repeat\(auto-fit,minmax/);
  assert.doesNotMatch(source, /type-caption/);
});

test('Reader uses auto layout only for the four-way color scheme without changing its model', async () => {
  const source = await readFile(
    'apps/web/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx',
    'utf8'
  );
  assert.match(source, /value=\{preferences\.colorScheme\}[\s\S]*columns="auto"/);
  for (const field of [
    'brightness',
    'fontFamily',
    'fontSize',
    'lineHeight',
    'paragraphSpacing',
    'pageMargin',
    'alignment',
    'fontWeight',
    'indent',
    'hyphenation',
    'dropCap',
    'keepAwake'
  ]) {
    assert.match(source, new RegExp(field));
  }
});
