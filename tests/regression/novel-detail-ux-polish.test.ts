import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('novel detail prioritizes reading and moves management actions into a secondary sheet', async () => {
  const [detail, management] = await Promise.all([
    read('apps/web-legacy/src/pages/novel-detail/ui/NovelDetailPage.tsx'),
    read('apps/web-legacy/src/pages/novel-detail/ui/NovelManagementSheet.tsx')
  ]);
  assert.match(detail, /NovelManagementSheet/);
  assert.match(management, /reader\.manageNovel/);
  assert.doesNotMatch(detail, /<UpdateNovelButton/);
  assert.doesNotMatch(detail, /<CrawlNovelButton/);
  assert.doesNotMatch(detail, /<ExportMenu/);
  assert.match(management, /UpdateNovelButton/);
  assert.match(management, /CrawlNovelButton/);
  assert.match(management, /ExportMenu/);
});

test('novel detail offers direct chapter jump and a clearly labeled danger zone', async () => {
  const [detail, chapters] = await Promise.all([
    read('apps/web-legacy/src/pages/novel-detail/ui/NovelDetailPage.tsx'),
    read('apps/web-legacy/src/entities/chapter/ui/ChapterList.tsx')
  ]);
  assert.match(chapters, /chapters\.goTo/);
  assert.match(chapters, /jumpToChapter/);
  assert.match(detail, /reader\.dangerZone/);
  assert.match(detail, /reader\.dangerZoneDescription/);
});

test('novel detail bookmarks use chapter titles instead of exposing paragraph ids', async () => {
  const detail = await read('apps/web-legacy/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  assert.match(detail, /bookmarkChapter/);
  assert.doesNotMatch(detail, /description=\{bookmark\.paragraphId\}/);
});

test('automatic update panel starts compact and reveals configuration on demand', async () => {
  const panel = await read('apps/web-legacy/src/features/auto-update/ui/AutoUpdatePanel.tsx');
  assert.match(panel, /const \[expanded, setExpanded\]/);
  assert.match(panel, /autoUpdate\.manage/);
  assert.match(panel, /expanded \?/);
});
