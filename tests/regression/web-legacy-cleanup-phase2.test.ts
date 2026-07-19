import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('runtime navigation no longer targets standalone crawl or tasks pages', () => {
  const header = read('apps/web/src/widgets/app-header/ui/AppHeader.tsx');
  const sidebar = read('apps/web/src/app/layouts/AppSidebar.tsx');
  const tabs = read('apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx');
  const library = read('apps/web/src/pages/library/model/useLibraryPage.ts');
  const detail = read('apps/web/src/pages/task-detail/ui/TaskDetailPage.tsx');

  for (const source of [header, sidebar, tabs, library, detail]) {
    assert.doesNotMatch(source, /['"]\/(crawl|tasks)(?:\/|['"])/);
  }
  assert.match(library, /openImport: addNovel\.open/);
  assert.match(detail, /navigate\('\/activity'\)/);
});

test('settings does not load or summarize source plugins', () => {
  const model = read('apps/web/src/pages/settings/model/useSettingsPage.tsx');
  const page = read('apps/web/src/pages/settings/ui/SettingsPage.tsx');
  const health = read('apps/web/src/widgets/system-health/ui/SystemHealthCard.tsx');

  assert.doesNotMatch(model, /listSourcePlugins|queryKeys\.sourcePlugins/);
  assert.doesNotMatch(page, /model\.plugins|pluginIssues|pluginCount/);
  assert.doesNotMatch(health, /pluginIssues|pluginCount|healthPlugins/);
});

test('legacy page and import-wizard translation keys are removed', () => {
  const en = read('apps/web/src/shared/i18n/locales/en.ts');
  const vi = read('apps/web/src/shared/i18n/locales/vi.ts');

  for (const locale of [en, vi]) {
    assert.doesNotMatch(locale, /'nav\.(crawl|tasks)'/);
    assert.doesNotMatch(locale, /'crawl\.import\./);
    assert.doesNotMatch(locale, /'tasks\.(eyebrow|title|description|empty)'/);
    assert.match(locale, /'nav\.activity'/);
    assert.match(locale, /'nav\.sources'/);
  }
});
