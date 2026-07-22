import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('NovelCool built-in normalizes newest-first source chapters before indexing', () => {
  const plugin = read(
    'apps/api-legacy/src/modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.ts'
  );
  assert.match(plugin, /if \(!href\) continue/);
  assert.match(plugin, /if \(!isChapterUrl\(resolved, finalUrl\)\) continue/);
  assert.match(plugin, /if \(seen\.has\(normalizedUrl\)\) continue/);
  assert.match(plugin, /\.reverse\(\)/);
  assert.match(plugin, /index: index \+ 1/);
});

test('database migration reindexes existing NovelCool chapters from parsed chapter numbers', () => {
  const database = read('apps/api-legacy/src/shared/database/sqlite.ts');
  assert.match(database, /version:\s*14/);
  assert.match(database, /reindexNovelCoolChapters/);
  assert.match(database, /parsedChapterNumber/);
  assert.match(database, /ordinal:\s*parsedChapterNumber/);
});

test('reader does not preload previous chapters until the user scrolls upward', () => {
  const page = read('apps/web-legacy/src/pages/chapter-reader/ui/ChapterReaderPage.tsx');
  assert.match(page, /allowPreviousLoad/);
  assert.match(page, /!allowPreviousLoad\.current/);
  assert.match(page, /delta < -10/);
});
