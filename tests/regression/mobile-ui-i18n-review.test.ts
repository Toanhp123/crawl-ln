import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('library card shows localized chapter count as a cover badge', () => {
  const source = read('apps/web/src/entities/novel/ui/NovelLibraryCard.tsx');

  assert.match(source, /library\.card\.chapterCount/);
  assert.match(source, /absolute right-2 top-2/);
  assert.match(source, /BookOpen/);
  assert.doesNotMatch(source, /common\.items/);
});

test('source plugin tests delegate stable loading feedback to the shared Button', () => {
  const source = read('apps/web/src/features/test-source-plugin/ui/TestSourcePluginButton.tsx');

  assert.match(source, /actionState=\{mutation\.status\}/);
  assert.match(source, /leadingIcon=\{<FlaskConical/);
  assert.doesNotMatch(source, /motion-safe:animate-spin/);
});

test('redesigned product screens route user-visible copy through i18n', () => {
  const files = [
    'apps/web/src/app/layouts/AppSidebar.tsx',
    'apps/web/src/app/layouts/GlobalAddNovelOverlay.tsx',
    'apps/web/src/pages/activity/ui/ActivityPage.tsx',
    'apps/web/src/pages/sources/model/useSourcesPage.ts',
    'apps/web/src/pages/sources/ui/SourcesPage.tsx',
    'apps/web/src/entities/source-plugin/ui/SourcePluginRow.tsx',
    'apps/web/src/features/manage-source-plugins/ui/SourcePluginActions.tsx',
    'apps/web/src/widgets/source-reader-overview/ui/SourceReaderOverview.tsx',
    'apps/web/src/pages/sources/ui/SourcePluginPage.tsx',
    'apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx'
  ];

  for (const path of files) {
    assert.doesNotMatch(read(path), /[À-ỹĐđ]/, path);
  }

  const taskCard = read('apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx');
  assert.match(taskCard, /t\('activity\.taskFallback'/);
  assert.match(taskCard, /t\('activity\.chapterProgress'/);
  assert.match(taskCard, /t\('common\.more'/);
  assert.match(taskCard, /t\('common\.retry'/);
});

test('English and Vietnamese dictionaries contain the redesigned screen keys', () => {
  const en = read('apps/web/src/shared/i18n/locales/en.ts');
  const vi = read('apps/web/src/shared/i18n/locales/vi.ts');
  const keys = [
    'library.card.chapterCount',
    'activity.description',
    'activity.running',
    'activity.queued',
    'activity.recent',
    'globalAdd.title',
    'globalAdd.advanced',
    'sources.console.description',
    'sources.section.plugins',
    'sources.section.credentials',
    'sources.section.network',
    'sources.section.challenges',
    'sources.section.inspector',
    'sources.inspector.run',
    'common.more',
    'common.status.active',
    'common.status.disabled'
  ];

  for (const key of keys) {
    assert.match(en, new RegExp(`'${key.replaceAll('.', '\\.')}'`), `en: ${key}`);
    assert.match(vi, new RegExp(`'${key.replaceAll('.', '\\.')}'`), `vi: ${key}`);
  }
});
