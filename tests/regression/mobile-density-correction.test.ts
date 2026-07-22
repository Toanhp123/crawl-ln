import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('mobile shell follows compact 56px navigation and hides branding header', () => {
  const size = read('apps/web-legacy/src/shared/theme/size.css');
  const shell = read('apps/web-legacy/src/app/layouts/AppShell.tsx');
  const header = read('apps/web-legacy/src/widgets/app-header/ui/AppHeader.tsx');
  const nav = read('apps/web-legacy/src/shared/ui/navigation/BottomNav.tsx');
  assert.match(size, /--height-bottom-nav:\s*3\.5rem/);
  assert.match(shell, /className="md:hidden"/);
  assert.doesNotMatch(header, /to="\/(crawl|tasks)"/);
  assert.match(nav, /h-full min-w-0/);
  assert.doesNotMatch(nav, /group-focus-visible.*w-full/);
});

test('library uses compact mobile controls and shared reading cards without a page-level card wrapper', () => {
  const page = read('apps/web-legacy/src/pages/library/ui/LibraryPage.tsx');
  const controls = read('apps/web-legacy/src/features/filter-library/ui/LibraryControlsSheet.tsx');
  const hero = read('apps/web-legacy/src/widgets/continue-reading/ui/ContinueReadingHero.tsx');
  assert.match(page, /LibraryControlsSheet/);
  assert.match(controls, /SegmentedControl/);
  assert.match(hero, /<Card/);
  assert.doesNotMatch(page, /<Card[^>]*>\s*<Page/);
});

test('app font size supports four persisted levels with preview', () => {
  const provider = read('apps/web-legacy/src/shared/theme/runtime/ThemeProvider.tsx');
  const appearance = read('apps/web-legacy/src/pages/settings/ui/SettingsPage.tsx');
  const typography = read('apps/web-legacy/src/shared/theme/typography.css');
  assert.match(provider, /'extra-large'/);
  assert.match(appearance, /fontPreview/);
  assert.match(appearance, /BottomSheet/);
  assert.match(typography, /data-app-font='extra-large'/);
});

test('bottom navigation provides compact icon-label rhythm and a color-only active indicator', () => {
  const nav = read('apps/web-legacy/src/shared/ui/navigation/BottomNav.tsx');
  assert.match(nav, /gap-0\.5/);
  assert.match(nav, /active \? 'text-primary'/);
  assert.doesNotMatch(nav, /bg-primary-selected/);
  assert.doesNotMatch(nav, /h-1 w-6 rounded-full bg-primary/);
  assert.match(nav, /min-w-0/);
  assert.match(nav, /type-caption font-medium/);
  assert.doesNotMatch(nav, /bottom-nav-label-size/);
});

test('settings is a compact navigation list and opens detail sheets', () => {
  const page = read('apps/web-legacy/src/pages/settings/ui/SettingsPage.tsx');
  assert.match(page, /SettingsHubCard/);
  assert.match(page, /BottomSheet/);
  assert.doesNotMatch(page, /<AppearanceSettings model=\{model\}\/>/);
  assert.doesNotMatch(page, /<ReaderSettings model=\{model\}\/>/);
});
