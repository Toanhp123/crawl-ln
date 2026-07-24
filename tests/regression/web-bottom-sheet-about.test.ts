import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('BottomSheet explicitly disables aria-describedby when no description is rendered', async () => {
  const source = await readFile('apps/web/src/shared/ui/overlay/BottomSheet.tsx', 'utf8');
  assert.match(
    source,
    /const contentDescriptionProps = description\s*\?\s*\{\}\s*:\s*\{\s*'aria-describedby': undefined\s*\}/
  );
  assert.match(source, /<Dialog\.Content\s+\{\.\.\.contentDescriptionProps\}/);
  assert.match(source, /description\s*\?\s*\(\s*<Dialog\.Description/);
});

test('About panel uses full-height divided setting rows instead of compressed flex lines', async () => {
  const source = await readFile('apps/web/src/pages/settings/ui/SettingsPage.tsx', 'utf8');
  const aboutPanel = source.match(/\{panel === 'about'[\s\S]*?\) : null\}/)?.[0];
  assert.ok(aboutPanel, 'About panel source must exist');
  assert.match(aboutPanel, /<Card padding="none" elevation="flat" className="overflow-hidden">/);
  assert.equal((aboutPanel.match(/<ListRow/g) ?? []).length, 2);
  assert.match(aboutPanel, /title=\{t\('settings\.version'\)\}/);
  assert.match(aboutPanel, /title=\{t\('settings\.build'\)\}/);
  assert.doesNotMatch(aboutPanel, /space-y-3/);
});
