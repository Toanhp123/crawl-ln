import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('reader back closes the overlay through the same history POP path as browser gesture', () => {
  const detailModel = read('apps/web/src/pages/novel-detail/model/useNovelDetailPage.ts');
  const readerModel = read('apps/web/src/pages/chapter-reader/model/useChapterReaderPage.ts');
  const detailPage = read('apps/web/src/pages/novel-detail/ui/NovelDetailPage.tsx');
  const chapterList = read('apps/web/src/entities/chapter/ui/ChapterList.tsx');

  assert.match(detailModel, /readerNavigationState\(location\.key\)/);
  assert.match(readerModel, /cameFromApp\(location\.state\)/);
  assert.match(readerModel, /navigate\(-1\)/);
  assert.match(readerModel, /replace:\s*true/);
  assert.doesNotMatch(detailPage, /readRestoreChapterIndex|restoreIndex/);
  assert.doesNotMatch(chapterList, /scrollIntoView|restoreIndex/);
});
