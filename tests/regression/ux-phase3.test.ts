import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('library prioritizes one continue-reading hero and mobile filter sheet', async () => {
  const [library, hero, controls] = await Promise.all([
    read('apps/web/src/pages/library/ui/LibraryPage.tsx'),
    read('apps/web/src/widgets/continue-reading/ui/ContinueReadingHero.tsx'),
    read('apps/web/src/features/filter-library/ui/LibraryControlsSheet.tsx')
  ]);
  assert.match(library, /ContinueReadingHero/);
  assert.match(library, /LibraryControlsSheet/);
  assert.match(hero, /readingHistory/);
  assert.match(controls, /BottomSheet/);
  assert.match(controls, /SegmentedControl/);
});

test('settings uses explicit reader controls and separates preferences from system information', async () => {
  const [settings, controls, model] = await Promise.all([
    read('apps/web/src/pages/settings/ui/SettingsPage.tsx'),
    read('apps/web/src/pages/settings/ui/ReaderSettingsControls.tsx'),
    read('apps/web/src/pages/settings/model/useSettingsPage.tsx')
  ]);
  assert.match(settings, /settings\.preferences/);
  assert.match(settings, /settings\.tasks/);
  assert.match(settings, /SettingsHubCard/);
  assert.match(settings, /SystemHealthCard/);
  assert.match(settings, /ReaderSettingsControls/);
  assert.match(controls, /SegmentedControl/);
  assert.match(controls, /<Switch/);
  assert.doesNotMatch(model, /cycleReader/);
});

test('novel detail consumes shared rows for bookmarks and emphasizes reading progress', async () => {
  const detail = await read('apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  assert.match(detail, /ListRow/);
  assert.match(detail, /reader\.readingProgress/);
  assert.match(detail, /latestPosition\?\.scrollRatio/);
});
