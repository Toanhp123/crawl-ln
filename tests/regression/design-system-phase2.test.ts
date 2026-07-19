import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('phase 2 exposes shared typography, list row, card variants, and sticky toolbar', async () => {
  const [index, text, listRow, card, stickyToolbar, toolbar] = await Promise.all([
    read('apps/web/src/shared/ui/index.ts'),
    read('apps/web/src/shared/ui/data-display/Text.tsx'),
    read('apps/web/src/shared/ui/data-display/ListRow.tsx'),
    read('apps/web/src/shared/ui/layout/Card.tsx'),
    read('apps/web/src/shared/ui/layout/StickyToolbar.tsx'),
    read('apps/web/src/shared/ui/layout/Toolbar.tsx')
  ]);
  assert.match(index, /data-display\/Text/);
  assert.match(index, /layout\/StickyToolbar/);
  assert.match(text, /variant:\s*\{/);
  assert.match(listRow, /export function ListRow/);
  assert.match(card, /interactive:/);
  assert.match(toolbar, /backdrop-blur-xl/);
  assert.match(stickyToolbar, /<Toolbar sticky/);
});

test('current settings, source, activity, and library surfaces consume shared primitives', async () => {
  const [settingRow, chapters, taskCard, sourceCard, library] = await Promise.all([
    read('apps/web/src/pages/settings/ui/SettingRow.tsx'),
    read('apps/web/src/entities/chapter/ui/ChapterList.tsx'),
    read('apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx'),
    read('apps/web/src/pages/sources/ui/SourceProfileCard.tsx'),
    read('apps/web/src/pages/library/ui/LibraryPage.tsx')
  ]);
  for (const source of [settingRow, chapters]) assert.match(source, /ListRow/);
  for (const source of [taskCard, sourceCard]) assert.match(source, /<Card/);
  assert.match(library, /StickyToolbar/);
});
