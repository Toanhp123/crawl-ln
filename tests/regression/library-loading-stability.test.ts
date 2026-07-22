import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('library resolves continue reading from list data without shifting the toolbar', async () => {
  const [page, model] = await Promise.all([
    read('apps/web-legacy/src/pages/library/ui/LibraryPage.tsx'),
    read('apps/web-legacy/src/pages/library/model/useLibraryPage.ts')
  ]);

  assert.doesNotMatch(page, /ContinueReadingSkeleton/);
  assert.doesNotMatch(page, /primaryNovel\.isLoading/);
  assert.ok(page.indexOf('<StickyToolbar') < page.indexOf('<ContinueReadingHero'));
  assert.doesNotMatch(model, /\bgetNovel\b/);
  assert.doesNotMatch(model, /queryKeys\.novel\(/);
  assert.match(model, /items\.find\(\(novel\) => novel\.id === primaryEntry\?\.novelId\)/);
});
