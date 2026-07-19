import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('NovelCool declares newest-first chapter order and crawler normalizes it before indexing', () => {
  const profile = JSON.parse(read('apps/api/config/source-profiles.json')) as Array<
    Record<string, unknown>
  >;
  const novelCool = profile.find((item) => item.id === 'novelcool');
  assert.equal(novelCool?.chapterListOrder, 'newest-first');
  const engine = read(
    'apps/api/src/modules/crawler/application/services/crawler-engine.service.ts'
  );
  assert.match(engine, /profile\.chapterListOrder === 'newest-first'/);
  assert.match(engine, /\[\.\.\.chapterCandidates\]\.reverse\(\)/);
});

test('database migration reindexes existing NovelCool chapters from parsed chapter numbers', () => {
  const database = read('apps/api/src/shared/database/sqlite.ts');
  assert.match(database, /version:\s*14/);
  assert.match(database, /reindexNovelCoolChapters/);
  assert.match(database, /parsedChapterNumber/);
  assert.match(database, /ordinal:\s*parsedChapterNumber/);
});

test('reader does not preload previous chapters until the user scrolls upward', () => {
  const page = read('apps/web/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(page, /allowPreviousLoad/);
  assert.match(page, /!allowPreviousLoad\.current/);
  assert.match(page, /delta < -10/);
});
