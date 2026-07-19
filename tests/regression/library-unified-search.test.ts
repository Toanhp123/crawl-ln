import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('library owns novel and content search scopes', async () => {
  const [page, model, content] = await Promise.all([
    read('apps/web/src/pages/library/ui/LibraryPage.tsx'),
    read('apps/web/src/pages/library/model/useLibraryPage.ts'),
    read('apps/web/src/features/search-library/ui/LibraryContentSearch.tsx')
  ]);

  assert.match(model, /searchScope/);
  assert.match(page, /library\.searchScope\.novels/);
  assert.match(page, /library\.searchScope\.content/);
  assert.match(page, /LibraryContentSearch/);
  assert.match(content, /useSearchLibrary\(normalized, 'chapter'/);
  assert.match(content, /function Highlighted/);
  assert.doesNotMatch(content, /dangerouslySetInnerHTML/);
});

test('standalone search destination is removed', async () => {
  const [router, header, tabs] = await Promise.all([
    read('apps/web/src/app/router/AppRouter.tsx'),
    read('apps/web/src/widgets/app-header/ui/AppHeader.tsx'),
    read('apps/web/src/widgets/bottom-tabs/ui/AppBottomTabs.tsx')
  ]);

  assert.doesNotMatch(router, /pages\/search|path="\/search"/);
  assert.doesNotMatch(header, /to: '\/search'/);
  assert.doesNotMatch(tabs, /href: '\/search'/);
});
