import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('shared design system owns reusable switch and icon tile compositions', () => {
  const exports = read('apps/web/src/shared/ui/index.ts');
  const switchSource = read('apps/web/src/shared/ui/forms/Switch.tsx');
  const iconTile = read('apps/web/src/shared/ui/data-display/IconTile.tsx');
  assert.match(exports, /forms\/Switch/);
  assert.match(exports, /data-display\/IconTile/);
  assert.match(switchSource, /role="switch"/);
  assert.match(switchSource, /--motion-fast/);
  assert.match(iconTile, /--icon-box-md/);
});

test('reader settings reuse the shared switch instead of private toggle variants', () => {
  const sheet = read('apps/web/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx');
  const settings = read('apps/web/src/pages/settings/ui/ReaderSettingsControls.tsx');
  assert.doesNotMatch(sheet, /function ToggleRow/);
  assert.doesNotMatch(settings, /function Toggle/);
  assert.match(sheet, /<Switch/);
  assert.match(settings, /<Switch/);
});

test('foundation audit removes remaining self-authored typography and bare transitions in audited UI', () => {
  const detail = read('apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  const offline = read('apps/web/src/features/read-chapter/ui/ReaderOfflineBanner.tsx');
  const addOverlay = read('apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx');
  assert.doesNotMatch(detail, /text-\[1\.35rem\]/);
  assert.doesNotMatch(detail, /\btransition\s/);
  assert.doesNotMatch(offline, /\btext-xs\b/);
  assert.doesNotMatch(addOverlay, /rounded-xl/);
});

test('feature code uses Panel instead of padded Surface card recipes', () => {
  const files = [
    'apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx',
    'apps/web/src/features/search-library/ui/LibraryContentSearch.tsx',
    'apps/web/src/features/search-library/ui/SearchIndexPanel.tsx'
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /<Surface[^>]*\bp-[345]/);
  }
});

test('shared UI documentation locks composition and arbitrary-value boundaries', () => {
  const docs = read('apps/web/src/shared/ui/README.md');
  assert.match(docs, /Use `Card` for elevated content containers/);
  assert.match(docs, /Use `Switch` for boolean settings/);
  assert.match(docs, /Arbitrary Tailwind values are limited/);
});
