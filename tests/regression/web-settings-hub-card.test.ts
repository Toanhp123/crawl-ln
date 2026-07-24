import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

test('SettingsHubCard has one interactive root, a separate current value, status, and chevron', async () => {
  const { SettingsHubCard } =
    await import('../../apps/web/src/pages/settings/ui/SettingsHubCard.tsx');
  const html = renderToStaticMarkup(
    createElement(SettingsHubCard, {
      icon: createElement('span', null, 'I'),
      title: 'Appearance',
      description: 'Configure appearance.',
      currentValue: 'System · Indigo · Compact',
      status: 'Local',
      statusTone: 'info',
      onClick() {}
    })
  );
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /data-settings-hub-card/);
  assert.match(html, /data-settings-current-value/);
  assert.match(html, /System · Indigo · Compact/);
  assert.match(html, /lucide-chevron-right/);
});

test('SettingsPage imports the focused card instead of declaring it inline', async () => {
  const [page, card] = await Promise.all([
    readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8'),
    readFile('apps/web/src/pages/settings/ui/SettingsHubCard.tsx', 'utf8')
  ]);
  assert.match(page, /from ['"]\.\/SettingsHubCard['"]/);
  assert.doesNotMatch(page, /function SettingsHubCard\(/);
  assert.match(card, /disabled=\{disabled\}/);
  assert.match(card, /onClick=\{onClick\}/);
});
