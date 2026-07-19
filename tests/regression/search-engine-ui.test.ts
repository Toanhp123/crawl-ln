import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('full-text search is embedded in library instead of a standalone route', async () => {
  const [router, page, content] = await Promise.all([
    read('apps/web/src/app/router/AppRouter.tsx'),
    read('apps/web/src/pages/library/ui/LibraryPage.tsx'),
    read('apps/web/src/features/search-library/ui/LibraryContentSearch.tsx')
  ]);

  assert.doesNotMatch(router, /path="\/search"/);
  assert.match(page, /LibraryContentSearch/);
  assert.match(content, /useSearchLibrary/);
});

test('search snippets are rendered safely', async () => {
  const content = await read('apps/web/src/features/search-library/ui/LibraryContentSearch.tsx');
  assert.match(content, /function Highlighted/);
  assert.doesNotMatch(content, /dangerouslySetInnerHTML/);
});
