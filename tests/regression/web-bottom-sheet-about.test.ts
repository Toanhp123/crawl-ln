import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ResponsiveDialog explicitly disables aria-describedby when no description is rendered', async () => {
  const source = await readFile('apps/web/src/shared/ui/overlay/ResponsiveDialog.tsx', 'utf8');
  assert.match(
    source,
    /const contentDescriptionProps = description\s*\?\s*\{\}\s*:\s*\{\s*'aria-describedby': undefined\s*\}/
  );
  assert.match(source, /<Dialog\.Content\s+\{\.\.\.contentDescriptionProps\}/);
  assert.match(source, /description\s*\?\s*\(\s*<Dialog\.Description/);
});

test('semantic overlays delegate responsive behavior to the internal ResponsiveDialog base', async () => {
  const [bottomSheet, drawer, modal] = await Promise.all(
    ['BottomSheet.tsx', 'Drawer.tsx', 'Modal.tsx'].map((file) =>
      readFile(`apps/web/src/shared/ui/overlay/${file}`, 'utf8')
    )
  );

  for (const source of [bottomSheet, drawer, modal]) {
    assert.match(source, /import \{ ResponsiveDialog \} from '\.\/ResponsiveDialog'/);
    assert.match(source, /<ResponsiveDialog/);
    assert.doesNotMatch(source, /@radix-ui\/react-dialog/);
  }
  assert.match(bottomSheet, /variant="sheet"/);
  assert.match(drawer, /variant="drawer"/);
  assert.match(modal, /variant="modal"/);
});

test('feature overlays choose desktop semantics instead of rendering BottomSheet directly', async () => {
  const featureOverlays = await Promise.all(
    [
      'apps/web/src/pages/settings/ui/SettingsPage.tsx',
      'apps/web/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx',
      'apps/web/src/pages/novel-detail/ui/NovelManagementSheet.tsx',
      'apps/web/src/features/select-chapter/ui/ChapterListSheet.tsx',
      'apps/web/src/pages/library/ui/LibraryControlsSheet.tsx',
      'apps/web/src/features/add-novel/ui/AddNovelOverlay.tsx'
    ].map((file) => readFile(file, 'utf8'))
  );

  for (const source of featureOverlays) assert.doesNotMatch(source, /BottomSheet/);
  assert.match(featureOverlays.at(-1) ?? '', /<Modal/);
  for (const source of featureOverlays.slice(0, -1)) assert.match(source, /<Drawer/);
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

test('ResponsiveDialog does not capture drag gestures that start on interactive header controls', async () => {
  const source = await readFile('apps/web/src/shared/ui/overlay/ResponsiveDialog.tsx', 'utf8');
  assert.match(source, /INTERACTIVE_DRAG_BLOCK_SELECTOR/);
  assert.match(source, /event\.target[\s\S]*?\.closest\(INTERACTIVE_DRAG_BLOCK_SELECTOR\)/);

  const handler = source.match(/const handleDragStart = \(event:[\s\S]*?\n  \};/)?.[0];
  assert.ok(handler, 'handleDragStart must exist');
  assert.match(handler, /closest\(INTERACTIVE_DRAG_BLOCK_SELECTOR\)[\s\S]*?return;/);
  assert.ok(
    handler.indexOf('closest(INTERACTIVE_DRAG_BLOCK_SELECTOR)') <
      handler.indexOf('setPointerCapture'),
    'interactive-target guard must run before pointer capture'
  );
});
