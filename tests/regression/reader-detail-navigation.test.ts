import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const router = readFileSync('apps/web-legacy/src/app/router/AppRouter.tsx', 'utf8');
const chapterList = readFileSync('apps/web-legacy/src/entities/chapter/ui/ChapterList.tsx', 'utf8');

test('novel overview stays mounted while immersive reader is a nested overlay', () => {
  assert.match(router, /path="\/library\/:novelId" element=\{<NovelDetailRoute \/>\}/);
  assert.match(router, /<Route element=\{<ReaderShell \/>\}>/);
  assert.match(router, /path="read\/:chapterIndex" element=\{<ChapterReaderPage \/>\}/);
  assert.doesNotMatch(router, /path="\/reader\/:novelId\/:chapterIndex"/);
});

test('chapter rows center their icon, content, badge and chevron vertically', () => {
  assert.match(chapterList, /items-center/);
  assert.doesNotMatch(chapterList, /items-start/);
});
